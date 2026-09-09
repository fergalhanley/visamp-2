/**
 * VIS-51: the single place uploaded bytes are admitted or refused.
 *
 * Runs after the object is in storage and before the asset is marked ready, so
 * nothing readable has ever been through a weaker check than this one.
 */

import { inspectBitmap } from "./bitmap.ts";
import { inspectGlb } from "./glb.ts";
import { inspectSvg } from "./svg.ts";
import { AssetRejected, ASSET_BYTE_LIMITS, type AcceptedUpload } from "./rules.ts";

export interface InspectedAsset {
  width: number | null;
  height: number | null;
}

export function inspectAssetBytes(
  bytes: Uint8Array,
  upload: Pick<AcceptedUpload, "kind" | "mimeType" | "bytes" | "sha256">,
  actualSha256: string,
): InspectedAsset {
  // The stored object is what everyone will read, so it — not the client's
  // description of it — is what has to satisfy every limit.
  if (bytes.byteLength !== upload.bytes)
    throw new AssetRejected("The uploaded file does not match the declared size.");
  if (actualSha256 !== upload.sha256)
    throw new AssetRejected("The uploaded file does not match its checksum.");
  if (bytes.byteLength > ASSET_BYTE_LIMITS[upload.kind])
    throw new AssetRejected("This file is larger than the limit for its type.");

  switch (upload.kind) {
    case "bitmap": {
      const info = inspectBitmap(bytes, upload.mimeType);
      return { width: info.width, height: info.height };
    }
    case "vector":
      inspectSvg(bytes);
      return { width: null, height: null };
    case "model":
      inspectGlb(bytes);
      return { width: null, height: null };
  }
}
