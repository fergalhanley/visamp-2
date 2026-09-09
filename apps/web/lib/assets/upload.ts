/**
 * VIS-52: the browser half of an upload.
 *
 * Three steps, because the bytes never pass through our server: the route
 * records the intended upload and hands back a key, the browser writes the
 * object under the storage policy, and the route then inspects what actually
 * landed. Nothing is readable until that third step succeeds.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";
import { acceptUploadDetails, AssetRejected } from "./rules.ts";

export const ASSET_BUCKET = "assets";

/** Same rules the server applies, run first so the file is refused instantly. */
export function describeUpload(file: File) {
  return acceptUploadDetails({
    fileName: file.name,
    bytes: file.size,
    // The checksum is computed later; this call is only reading name and size.
    sha256: "0".repeat(64),
  });
}

export async function uploadAsset(
  supabase: SupabaseClient<Database>,
  file: File,
  onStage?: (stage: string) => void,
): Promise<string> {
  // Fails on an unsupported type or an oversized file without a round trip.
  const described = describeUpload(file);

  onStage?.("Checking your file…");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const digest = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  const sha256 = [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

  onStage?.("Reserving a place for it…");
  const started = await fetch("/api/assets", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fileName: file.name, bytes: file.size, sha256 }),
  });
  const reservation = await started.json();
  if (!started.ok) throw new AssetRejected(reservation.error ?? "Could not start the upload.");

  onStage?.("Uploading…");
  const stored = await supabase.storage
    .from(ASSET_BUCKET)
    .upload(reservation.objectKey, file, {
      contentType: described.mimeType,
      upsert: true,
    });
  if (stored.error) throw new AssetRejected(`Could not upload the file: ${stored.error.message}`);

  // The server reads back what was stored and decides. Until this returns, the
  // asset is not readable by anyone and cannot be published.
  onStage?.("Checking the file we received…");
  const finished = await fetch(`/api/assets/${reservation.id}/complete`, { method: "POST" });
  const result = await finished.json();
  if (!finished.ok) throw new AssetRejected(result.error ?? "The uploaded file was rejected.");

  return reservation.id as string;
}

export async function setAssetVisibility(id: string, visibility: "public" | "private") {
  const response = await fetch(`/api/assets/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ visibility }),
  });
  const result = await response.json();
  if (!response.ok) throw new AssetRejected(result.error ?? "Could not change visibility.");
  return result;
}

export async function deleteAsset(id: string) {
  const response = await fetch(`/api/assets/${id}`, { method: "DELETE" });
  const result = await response.json();
  if (!response.ok) throw new AssetRejected(result.error ?? "Could not delete this asset.");
}

/** The exact DSL an author pastes to use an asset. */
export function assetReference(kind: "bitmap" | "vector" | "model", id: string) {
  return `asset::${kind}("${id}")`;
}
