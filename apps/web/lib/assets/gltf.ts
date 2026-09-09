/**
 * VIS-53: GLB → the vertex arrays the engine's `set_asset_mesh` expects.
 *
 * Admission (`inspectGlb`) and extraction are separate on purpose. The
 * validator is the security boundary — it is what refuses external references
 * and malformed containers — and it stays untouched here. This runs only after
 * it has passed, so the chunk walk below can assume a well-formed container and
 * concern itself with geometry.
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
  bufferView?: number;
  byteOffset?: number;
  componentType?: number;
  count?: number;
  type?: string;
  normalized?: boolean;
}

interface GltfBufferView {
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

export function parseGlbMesh(bytes: Uint8Array): MeshArrays {
  inspectGlb(bytes);

  const { json, bin } = readChunks(bytes);
  const gltf = json as Gltf;

  const vertices: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  // Nodes carry the transform that places their mesh. Ignoring it would pile
  // every part of a model on top of the others at the origin.
  const scene = gltf.scenes?.[gltf.scene ?? 0];
  const roots: number[] = scene?.nodes ?? gltf.nodes?.map((_, index) => index) ?? [];

  const visit = (nodeIndex: number, parent: number[], depth: number) => {
    // Cyclic or absurdly deep hierarchies are malformed; stop rather than spin.
    if (depth > 64) return;
    const node = gltf.nodes?.[nodeIndex];
    if (!node) return;

    const world = multiply(parent, localMatrix(node));

    if (typeof node.mesh === "number") {
      for (const primitive of gltf.meshes?.[node.mesh]?.primitives ?? []) {
        // Only triangles. mode defaults to 4 when absent.
        if (primitive.mode !== undefined && primitive.mode !== 4) continue;
        const part = readPrimitive(gltf, bin, primitive);
        if (!part) continue;

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

  if (vertices.length === 0)
    throw new AssetRejected("This model contains no triangle geometry.");

  // The engine falls back to per-face normals when the array is empty, which is
  // better than shading every vertex from a zero normal.
  const hasNormals = normals.some((n) => n !== 0);

  return {
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
  if (typeof positionIndex !== "number") return null;

  const positions = readAccessor(gltf, bin, positionIndex, 3);
  if (!positions) return null;

  const normals = readAccessor(gltf, bin, primitive.attributes?.NORMAL, 3);
  const uvs = readAccessor(gltf, bin, primitive.attributes?.TEXCOORD_0, 2);

  const count = positions.length / 3;
  let indices: Uint32Array;
  if (typeof primitive.indices === "number") {
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

  return { positions, normals, uvs, indices };
}

/** Reads an accessor as floats, honouring byte stride and normalised integers. */
function readAccessor(
  gltf: Gltf,
  bin: Uint8Array,
  index: unknown,
  expected: number,
): Float32Array | null {
  if (typeof index !== "number") return null;
  const accessor = gltf.accessors?.[index];
  if (!accessor) return null;

  const components = TYPE_COUNTS[accessor.type ?? ""];
  const componentSize = COMPONENT_SIZES[accessor.componentType ?? -1];
  if (!components || !componentSize || components !== expected) return null;

  const view = gltf.bufferViews?.[accessor.bufferView ?? -1];
  if (!view) return null;

  const base = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const stride: number = view.byteStride ?? components * componentSize;
  const count: number = accessor.count ?? 0;
  const end = base + (count - 1) * stride + components * componentSize;
  if (count <= 0 || end > bin.byteLength)
    throw new AssetRejected("This model's geometry runs past the end of its buffer.");

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
