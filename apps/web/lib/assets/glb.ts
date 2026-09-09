/**
 * VIS-51: GLB (binary glTF) admission.
 *
 * Only the single-file GLB container is accepted. A .gltf JSON model normally
 * points at sibling texture and buffer files, which we would have no way to
 * store, validate, or withdraw alongside it — so every dependency has to be
 * inside the one object we hold.
 */

import { AssetRejected } from "./rules.ts";

const MAGIC = 0x46546c67; // "glTF"
const JSON_CHUNK = 0x4e4f534a; // "JSON"
const BIN_CHUNK = 0x004e4942; // "BIN\0"
const MAX_JSON_CHUNK = 16 * 1024 * 1024;

/** Throws `AssetRejected` unless the bytes are a self-contained glTF 2.0 binary. */
export function inspectGlb(bytes: Uint8Array): void {
  if (bytes.byteLength < 12)
    throw new AssetRejected("This file is too small to be a GLB model.");

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  if (view.getUint32(0, true) !== MAGIC)
    throw new AssetRejected("This file is not a GLB model.");
  if (view.getUint32(4, true) !== 2)
    throw new AssetRejected("Only glTF 2.0 models are supported.");
  // A declared length that disagrees with the object is either truncated or
  // carrying trailing data we would never render.
  if (view.getUint32(8, true) !== bytes.byteLength)
    throw new AssetRejected("This GLB model is truncated or has trailing data.");

  let offset = 12;
  let json: unknown = null;
  let sawBinary = false;

  while (offset + 8 <= bytes.byteLength) {
    const length = view.getUint32(offset, true);
    const type = view.getUint32(offset + 4, true);
    const start = offset + 8;

    if (length % 4 !== 0)
      throw new AssetRejected("This GLB model has a misaligned chunk.");
    if (start + length > bytes.byteLength)
      throw new AssetRejected("This GLB model has a chunk that runs past its end.");

    if (type === JSON_CHUNK) {
      if (json !== null)
        throw new AssetRejected("This GLB model has more than one JSON chunk.");
      if (offset !== 12)
        throw new AssetRejected("The JSON chunk must come first in a GLB model.");
      if (length > MAX_JSON_CHUNK)
        throw new AssetRejected("This GLB model's JSON chunk is too large.");
      try {
        json = JSON.parse(
          new TextDecoder("utf-8", { fatal: true }).decode(
            bytes.subarray(start, start + length),
          ),
        );
      } catch {
        throw new AssetRejected("This GLB model's JSON chunk is not readable.");
      }
    } else if (type === BIN_CHUNK) {
      if (json === null)
        throw new AssetRejected("The JSON chunk must come first in a GLB model.");
      sawBinary = true;
    }
    // Unknown chunk types are skipped, as the glTF specification requires.

    offset = start + length;
  }

  if (offset !== bytes.byteLength)
    throw new AssetRejected("This GLB model has a chunk that runs past its end.");
  if (json === null || typeof json !== "object" || Array.isArray(json))
    throw new AssetRejected("This GLB model has no glTF description.");

  assertSelfContained(json as Record<string, unknown>, sawBinary);
}

function assertSelfContained(gltf: Record<string, unknown>, sawBinary: boolean): void {
  for (const field of ["buffers", "images"] as const) {
    const entries = gltf[field];
    if (entries === undefined) continue;
    if (!Array.isArray(entries))
      throw new AssetRejected("This GLB model's description is malformed.");

    for (const entry of entries) {
      const uri = (entry as Record<string, unknown> | null)?.uri;
      if (uri === undefined || uri === null) {
        // No URI means the data sits in the binary chunk, which must exist.
        if (!sawBinary)
          throw new AssetRejected("This GLB model refers to a missing binary chunk.");
        continue;
      }
      if (typeof uri !== "string")
        throw new AssetRejected("This GLB model's description is malformed.");
      if (!uri.startsWith("data:"))
        throw new AssetRejected(
          "This GLB model references external files. Export it with textures and buffers embedded.",
        );
    }
  }
}
