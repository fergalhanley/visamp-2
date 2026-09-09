/**
 * VIS-51: what may be uploaded, and how big.
 *
 * Kept free of `server-only` imports so the rules can be unit tested and reused
 * by the upload UI (VIS-52) to fail fast before spending a round trip. The
 * limits here mirror the CHECK constraints in
 * `supabase/migrations/20260909020000_visual_assets.sql`; change both together.
 */

export type AssetKind = "bitmap" | "vector" | "model";

export const ASSET_BYTE_LIMITS: Record<AssetKind, number> = {
  bitmap: 20 * 1024 * 1024,
  vector: 2 * 1024 * 1024,
  model: 60 * 1024 * 1024,
};

/** Guards against decompression bombs: a 2 KB PNG can declare 40000×40000. */
export const MAX_BITMAP_PIXELS = 8192 * 8192;

export const ASSET_TYPES: Record<string, { kind: AssetKind; mimeType: string }> = {
  png: { kind: "bitmap", mimeType: "image/png" },
  jpg: { kind: "bitmap", mimeType: "image/jpeg" },
  jpeg: { kind: "bitmap", mimeType: "image/jpeg" },
  webp: { kind: "bitmap", mimeType: "image/webp" },
  svg: { kind: "vector", mimeType: "image/svg+xml" },
  glb: { kind: "model", mimeType: "model/gltf-binary" },
};

export const ACCEPTED_EXTENSIONS = Object.keys(ASSET_TYPES);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface AssetUploadDetails {
  fileName: string;
  bytes: number;
  sha256: string;
}

export interface AcceptedUpload extends AssetUploadDetails {
  kind: AssetKind;
  mimeType: string;
  extension: string;
}

export class AssetRejected extends Error {}

/**
 * Validates the metadata a client asserts before any bytes move. The bytes
 * themselves are not trusted until `inspectAssetBytes` has seen them —
 * a caller can claim any extension for any content.
 */
export function acceptUploadDetails(input: unknown): AcceptedUpload {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new AssetRejected("Invalid upload details.");

  const { fileName, bytes, sha256 } = input as Record<string, unknown>;

  if (typeof fileName !== "string" || !fileName.trim() || fileName.length > 255)
    throw new AssetRejected("A file name of up to 255 characters is required.");

  const extension = fileName.split(".").at(-1)?.toLowerCase() ?? "";
  const type = Object.hasOwn(ASSET_TYPES, extension)
    ? ASSET_TYPES[extension]!
    : null;
  if (!type)
    throw new AssetRejected(
      `Unsupported file type. Accepted formats: ${ACCEPTED_EXTENSIONS.join(", ")}.`,
    );

  if (
    typeof bytes !== "number" ||
    !Number.isSafeInteger(bytes) ||
    bytes < 1 ||
    bytes > ASSET_BYTE_LIMITS[type.kind]
  )
    throw new AssetRejected(
      `${extension.toUpperCase()} files must be between 1 byte and ${
        ASSET_BYTE_LIMITS[type.kind] / (1024 * 1024)
      } MB.`,
    );

  if (typeof sha256 !== "string" || !/^[0-9a-f]{64}$/.test(sha256))
    throw new AssetRejected("A SHA-256 checksum of the file is required.");

  return {
    fileName: fileName.trim(),
    bytes,
    sha256,
    extension,
    kind: type.kind,
    mimeType: type.mimeType,
  };
}

/** The object key an asset's bytes live at. Mirrors `assets_object_key_shape`. */
export function assetObjectKey(
  ownerId: string,
  assetId: string,
  extension: string,
): string {
  if (!UUID.test(ownerId) || !UUID.test(assetId))
    throw new AssetRejected("Invalid asset identifiers.");
  if (!Object.hasOwn(ASSET_TYPES, extension))
    throw new AssetRejected("Unsupported file type.");
  return `${ownerId}/${assetId}.${extension}`;
}
