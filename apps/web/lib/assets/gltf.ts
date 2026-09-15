/** GLB geometry shared by upload admission and browser asset resolution.
 * POINTS preserve draw order; TRIANGLES also expose their source vertices for
 * point-cloud rendering. Node transforms are baked once when resolving assets.
 */

import { AssetRejected } from "./rules.ts";
import { inspectGlb } from "./glb.ts";

export interface MeshArrays {
  vertices: Float32Array;
  indices: Uint32Array;
  normals: Float32Array;
  uvs: Float32Array;
}

const JSON_CHUNK = 0x4e4f534a;
const BIN_CHUNK = 0x004e4942;

const COMPONENT_SIZES: Record<number, number> = {
  5120: 1, // byte
  5121: 1, // unsigned byte
  5122: 2, // short
  5123: 2, // unsigned short
  5125: 4, // unsigned int
  5126: 4, // float
};

const TYPE_COUNTS: Record<string, number> = {
  SCALAR: 1,
  VEC2: 2,
  VEC3: 3,
  VEC4: 4,
};

/** The subset of glTF this reader looks at. Anything else is ignored. */
interface GltfAccessor {
  sparse?: unknown;
  bufferView?: number;
  byteOffset?: number;
  componentType?: number;
  count?: number;
  type?: string;
  normalized?: boolean;
}

interface GltfBufferView {
  buffer?: number;
  byteOffset?: number;
  byteLength?: number;
  byteStride?: number;
}

interface GltfPrimitive {
  attributes?: Record<string, number>;
  indices?: number;
  mode?: number;
}

interface GltfNode {
  mesh?: number;
  children?: number[];
  matrix?: number[];
  translation?: number[];
  rotation?: number[];
  scale?: number[];
}

interface Gltf {
  asset?: { version?: string };
  buffers?: { uri?: string; byteLength?: number }[];
  scene?: number;
  scenes?: { nodes?: number[] }[];
  nodes?: GltfNode[];
  meshes?: { primitives?: GltfPrimitive[] }[];
  accessors?: GltfAccessor[];
  bufferViews?: GltfBufferView[];
}

/** Everything under one glTF node, already in the node's own space. */
interface Primitive {
  positions: Float32Array;
  normals: Float32Array | null;
  uvs: Float32Array | null;
  indices: Uint32Array;
}

const MAX_POINTS = 1_000_000;
const MAX_MESH_VERTICES = 65_536;
const MAX_INDICES = 6_000_000;

export interface ModelArrays extends MeshArrays {
  points: Float32Array;
}

/** Compatibility entry point for callers requiring triangle geometry. */
export function parseGlbMesh(bytes: Uint8Array): MeshArrays {
  const model = parseGlbModel(bytes);
  if (!model.vertices.length)
    throw new AssetRejected("This model contains no triangle geometry.");
  return model;
}

export function parseGlbModel(bytes: Uint8Array): ModelArrays {
  try {
    return decodeGlbModel(bytes);
  } catch (error) {
    if (error instanceof AssetRejected) throw error;
    throw new AssetRejected("This model has a malformed geometry description.");
  }
}

function decodeGlbModel(bytes: Uint8Array): ModelArrays {
  inspectGlb(bytes);

  const { json, bin } = readChunks(bytes);
  const gltf = json as Gltf;
  const buffer = gltf.buffers?.[0];
  if (gltf.asset?.version !== "2.0" || !buffer || buffer.uri !== undefined
      || !Number.isSafeInteger(buffer.byteLength) || buffer.byteLength! < 0
      || buffer.byteLength! > bin.byteLength || bin.byteLength - buffer.byteLength! > 3)
    throw new AssetRejected("Model geometry must use a glTF 2.0 embedded binary buffer.");

  const points: number[] = [];
  const vertices: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  // Nodes carry the transform that places their mesh. Ignoring it would pile
  // every part of a model on top of the others at the origin.
  const scene = gltf.scenes?.[gltf.scene ?? 0];
  if (gltf.scene !== undefined && (!Number.isInteger(gltf.scene) || !scene))
    throw new AssetRejected("This model references a missing scene.");
  const children = new Set(gltf.nodes?.flatMap((node) => node.children ?? []));
  const roots = scene?.nodes ?? gltf.nodes?.map((_, i) => i).filter((i) => !children.has(i)) ?? [];
  const visited = new Set<number>();
  const visit = (nodeIndex: number, parent: number[], depth: number) => {
    if (!Number.isInteger(nodeIndex) || depth > 64 || visited.has(nodeIndex) || visited.size >= 10_000)
      throw new AssetRejected("This model has an invalid or excessive node hierarchy.");
    const node = gltf.nodes?.[nodeIndex];
    if (!node) throw new AssetRejected("This model references a missing node.");
    visited.add(nodeIndex);

    const world = multiply(parent, localMatrix(node));

    if (node.mesh !== undefined) {
      const mesh = Number.isInteger(node.mesh) ? gltf.meshes?.[node.mesh] : undefined;
      if (!mesh) throw new AssetRejected("This model references a missing mesh.");
      for (const primitive of mesh.primitives ?? []) {
        // Other primitive types do not have a renderer yet.
        if (primitive.mode !== undefined && primitive.mode !== 4 && primitive.mode !== 0) continue;
        const part = readPrimitive(gltf, bin, primitive);
        if (!part) continue;

        const isPoints = primitive.mode === 0;
        const pointCount = isPoints ? part.indices.length : part.positions.length / 3;
        if (points.length / 3 + pointCount > MAX_POINTS)
          throw new AssetRejected("This model exceeds the 1,000,000 point limit.");
        if (!isPoints && (vertices.length / 3 + pointCount > MAX_MESH_VERTICES || indices.length + part.indices.length > MAX_INDICES))
          throw new AssetRejected("This model exceeds the triangle geometry limit.");
        const transformed = new Float32Array(part.positions.length);
        for (let i = 0; i < part.positions.length; i += 3) {
          const p = transformPoint(world, [part.positions[i]!, part.positions[i + 1]!, part.positions[i + 2]!]);
          transformed.set(p, i);
        }
        if (transformed.some((v) => !Number.isFinite(v)))
          throw new AssetRejected("This model contains non-finite transformed positions.");
        if (isPoints) {
          for (const index of part.indices) {
            points.push(transformed[index * 3]!, transformed[index * 3 + 1]!, transformed[index * 3 + 2]!);
          }
          continue;
        }
        for (const value of transformed) points.push(value);
        const base = vertices.length / 3;
        for (let i = 0; i < part.positions.length; i += 3) {
          const p = transformPoint(world, [
            part.positions[i]!,
            part.positions[i + 1]!,
            part.positions[i + 2]!,
          ]);
          vertices.push(p[0], p[1], p[2]);

          if (part.normals) {
            // Normals rotate but must not translate, and are renormalised
            // because a scaled node would otherwise stretch them.
            const n = normalise(
              transformDirection(world, [
                part.normals[i]!,
                part.normals[i + 1]!,
                part.normals[i + 2]!,
              ]),
            );
            normals.push(n[0], n[1], n[2]);
          } else {
            normals.push(0, 0, 0);
          }
        }

        const uvCount = part.positions.length / 3;
        for (let i = 0; i < uvCount; i += 1) {
          uvs.push(part.uvs?.[i * 2] ?? 0, part.uvs?.[i * 2 + 1] ?? 0);
        }

        for (const index of part.indices) indices.push(base + index);
      }
    }

    for (const child of node.children ?? []) visit(child, world, depth + 1);
  };

  for (const root of roots) visit(root, IDENTITY, 0);

  if (points.length === 0)
    throw new AssetRejected("This model contains no supported point or triangle geometry.");

  // The engine falls back to per-face normals when the array is empty, which is
  // better than shading every vertex from a zero normal.
  const hasNormals = normals.some((n) => n !== 0);

  return {
    points: new Float32Array(points),
    vertices: new Float32Array(vertices),
    indices: new Uint32Array(indices),
    normals: hasNormals ? new Float32Array(normals) : new Float32Array(0),
    uvs: new Float32Array(uvs),
  };
}

function readChunks(bytes: Uint8Array): { json: unknown; bin: Uint8Array<ArrayBufferLike> } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 12;
  let json: unknown = null;
  let bin: Uint8Array<ArrayBufferLike> = new Uint8Array(0);

  while (offset + 8 <= bytes.byteLength) {
    const length = view.getUint32(offset, true);
    const type = view.getUint32(offset + 4, true);
    const start = offset + 8;
    if (type === JSON_CHUNK) {
      json = JSON.parse(new TextDecoder().decode(bytes.subarray(start, start + length)));
    } else if (type === BIN_CHUNK) {
      bin = bytes.subarray(start, start + length);
    }
    offset = start + length;
  }

  if (!json || typeof json !== "object")
    throw new AssetRejected("This model has no glTF description.");
  return { json, bin };
}

function readPrimitive(
  gltf: Gltf,
  bin: Uint8Array,
  primitive: GltfPrimitive,
): Primitive | null {
  const positionIndex = primitive.attributes?.POSITION;
  if (typeof positionIndex !== "number")
    throw new AssetRejected("This model has geometry without positions.");
  if (gltf.accessors?.[positionIndex]?.componentType !== 5126)
    throw new AssetRejected("Model positions must use floating-point VEC3 values.");

  const positions = readAccessor(gltf, bin, positionIndex, 3);
  if (!positions) return null;

  const normals = readAccessor(gltf, bin, primitive.attributes?.NORMAL, 3);
  const uvs = readAccessor(gltf, bin, primitive.attributes?.TEXCOORD_0, 2);

  const count = positions.length / 3;
  if ((normals && normals.length !== positions.length) || (uvs && uvs.length !== count * 2))
    throw new AssetRejected("This model has mismatched vertex attribute counts.");
  let indices: Uint32Array;
  if (primitive.indices !== undefined) {
    if (!Number.isInteger(primitive.indices))
      throw new AssetRejected("This model has an invalid index accessor reference.");
    const accessor = gltf.accessors?.[primitive.indices];
    if (!accessor || ![5121, 5123, 5125].includes(accessor.componentType ?? 0) || accessor.normalized)
      throw new AssetRejected("Model indices must be unsigned integers.");
    const read = readAccessor(gltf, bin, primitive.indices, 1);
    if (!read) return null;
    indices = Uint32Array.from(read);
  } else {
    // Unindexed geometry is drawn in order.
    indices = Uint32Array.from({ length: count }, (_, i) => i);
  }

  // An index past the end of the vertex array would read someone else's data.
  for (const index of indices) {
    if (index >= count) throw new AssetRejected("This model has an out-of-range vertex index.");
  }

  if (primitive.mode !== 0 && indices.length % 3 !== 0)
    throw new AssetRejected("This model has an incomplete triangle.");
  return { positions, normals, uvs, indices };
}

/** Reads an accessor as floats, honouring byte stride and normalised integers. */
function readAccessor(
  gltf: Gltf,
  bin: Uint8Array,
  index: unknown,
  expected: number,
): Float32Array | null {
  if (index === undefined) return null;
  const accessor = typeof index === "number" && Number.isInteger(index) ? gltf.accessors?.[index] : undefined;
  if (!accessor || accessor.sparse)
    throw new AssetRejected("This model has a missing or unsupported sparse accessor.");

  const components = TYPE_COUNTS[accessor.type ?? ""];
  const componentSize = COMPONENT_SIZES[accessor.componentType ?? -1];
  if (!components || !componentSize || components !== expected)
    throw new AssetRejected("This model has an unsupported geometry accessor.");

  const view = Number.isInteger(accessor.bufferView) ? gltf.bufferViews?.[accessor.bufferView!] : undefined;
  if (!view || (view.buffer ?? 0) !== 0)
    throw new AssetRejected("Model geometry must use the embedded binary buffer.");
  const viewOffset = view.byteOffset ?? 0;
  const viewLength = view.byteLength ?? 0;
  const accessorOffset = accessor.byteOffset ?? 0;
  const stride = view.byteStride ?? components * componentSize;
  const count = accessor.count ?? 0;
  const base = viewOffset + accessorOffset;
  const end = accessorOffset + (count - 1) * stride + components * componentSize;
  if (![viewOffset, viewLength, accessorOffset, stride, count].every((v) => Number.isSafeInteger(v) && v >= 0)
      || count === 0 || count > (expected === 1 ? MAX_INDICES : MAX_POINTS)
      || stride < components * componentSize || stride % componentSize !== 0
      || base % componentSize !== 0 || (view.byteStride !== undefined && stride > 252)
      || viewOffset + viewLength > (gltf.buffers?.[0]?.byteLength ?? 0) || end > viewLength)
    throw new AssetRejected("This model has invalid or excessive geometry buffer bounds.");

  const data = new DataView(bin.buffer, bin.byteOffset, bin.byteLength);
  const out = new Float32Array(count * components);

  for (let element = 0; element < count; element += 1) {
    for (let component = 0; component < components; component += 1) {
      const at = base + element * stride + component * componentSize;
      out[element * components + component] = readComponent(
        data,
        at,
        accessor.componentType ?? 0,
        accessor.normalized === true,
      );
    }
  }
  if (out.some((value) => !Number.isFinite(value)))
    throw new AssetRejected("This model contains non-finite geometry values.");
  return out;
}

function readComponent(
  data: DataView,
  at: number,
  componentType: number,
  normalized: boolean,
): number {
  switch (componentType) {
    case 5126:
      return data.getFloat32(at, true);
    case 5125:
      return data.getUint32(at, true);
    case 5123: {
      const value = data.getUint16(at, true);
      return normalized ? value / 65535 : value;
    }
    case 5122: {
      const value = data.getInt16(at, true);
      return normalized ? Math.max(value / 32767, -1) : value;
    }
    case 5121: {
      const value = data.getUint8(at);
      return normalized ? value / 255 : value;
    }
    case 5120: {
      const value = data.getInt8(at);
      return normalized ? Math.max(value / 127, -1) : value;
    }
    default:
      return 0;
  }
}

// ── Matrices, column-major as glTF stores them ──────────────────────────────

const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

function localMatrix(node: GltfNode): number[] {
  for (const [value, length] of [[node.matrix, 16], [node.translation, 3], [node.rotation, 4], [node.scale, 3]] as const) {
    if (value !== undefined && (!Array.isArray(value) || value.length !== length || value.some((v) => !Number.isFinite(v))))
      throw new AssetRejected("This model has an invalid node transform.");
  }
  if (Array.isArray(node.matrix) && node.matrix.length === 16) return node.matrix;

  const [tx = 0, ty = 0, tz = 0] = node.translation ?? [];
  const [qx = 0, qy = 0, qz = 0, qw = 1] = node.rotation ?? [];
  const [sx = 1, sy = 1, sz = 1] = node.scale ?? [];

  const x2 = qx + qx;
  const y2 = qy + qy;
  const z2 = qz + qz;
  const xx = qx * x2;
  const xy = qx * y2;
  const xz = qx * z2;
  const yy = qy * y2;
  const yz = qy * z2;
  const zz = qz * z2;
  const wx = qw * x2;
  const wy = qw * y2;
  const wz = qw * z2;

  return [
    (1 - (yy + zz)) * sx, (xy + wz) * sx, (xz - wy) * sx, 0,
    (xy - wz) * sy, (1 - (xx + zz)) * sy, (yz + wx) * sy, 0,
    (xz + wy) * sz, (yz - wx) * sz, (1 - (xx + yy)) * sz, 0,
    tx, ty, tz, 1,
  ];
}

function multiply(a: number[], b: number[]): number[] {
  const out = new Array(16).fill(0);
  for (let column = 0; column < 4; column += 1) {
    for (let row = 0; row < 4; row += 1) {
      let sum = 0;
      for (let k = 0; k < 4; k += 1) sum += a[k * 4 + row]! * b[column * 4 + k]!;
      out[column * 4 + row] = sum;
    }
  }
  return out;
}

function transformPoint(m: number[], p: [number, number, number]): [number, number, number] {
  return [
    m[0]! * p[0] + m[4]! * p[1] + m[8]! * p[2] + m[12]!,
    m[1]! * p[0] + m[5]! * p[1] + m[9]! * p[2] + m[13]!,
    m[2]! * p[0] + m[6]! * p[1] + m[10]! * p[2] + m[14]!,
  ];
}

function transformDirection(m: number[], v: [number, number, number]): [number, number, number] {
  return [
    m[0]! * v[0] + m[4]! * v[1] + m[8]! * v[2],
    m[1]! * v[0] + m[5]! * v[1] + m[9]! * v[2],
    m[2]! * v[0] + m[6]! * v[1] + m[10]! * v[2],
  ];
}

function normalise(v: [number, number, number]): [number, number, number] {
  const length = Math.hypot(v[0], v[1], v[2]);
  return length > 0 ? [v[0] / length, v[1] / length, v[2] / length] : [0, 0, 0];
}
