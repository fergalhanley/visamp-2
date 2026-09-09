import "server-only";

import { createHash, randomUUID } from "node:crypto";

import { AdminAuthorizationError } from "@/lib/hosted-audio/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

import { inspectAssetBytes } from "./content.ts";
import {
  acceptUploadDetails,
  assetObjectKey,
  AssetRejected,
  type AcceptedUpload,
} from "./rules.ts";

export const ASSET_BUCKET = "assets";

/** Bounds the JSON body before buffering it; asset bytes never pass through here. */
export async function readAssetDetails(request: Request): Promise<unknown> {
  const reader = request.body?.getReader();
  if (!reader) throw new AssetRejected("Missing request body.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 4096) {
        await reader.cancel();
        throw new AssetRejected("Upload details are too large.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new AssetRejected("Invalid upload details.");
  }
}

export async function assetIdentity() {
  const session = await createClient();
  const { data, error } = await session.auth.getUser();
  if (error || !data.user)
    throw new AdminAuthorizationError(401, "Sign in to upload assets.");
  // The session client, not the service role: the insert and update policies in
  // the migration are the access control, so they have to be the code path that
  // actually runs.
  return { userId: data.user.id, db: session };
}

export function assetError(error: unknown) {
  if (error instanceof AssetRejected)
    return Response.json({ error: error.message }, { status: 400 });
  if (error instanceof AdminAuthorizationError)
    return Response.json({ error: error.message }, { status: error.status });
  return Response.json(
    { error: "Assets are unavailable. Please try again later." },
    { status: 503 },
  );
}

export interface StartedUpload extends AcceptedUpload {
  id: string;
  objectKey: string;
}

/** Records the intended upload so the storage policy has a row to authorise. */
export async function startAssetUpload(
  body: unknown,
  userId: string,
  db: Awaited<ReturnType<typeof createClient>>,
): Promise<StartedUpload> {
  const upload = acceptUploadDetails(body);
  const id = randomUUID();
  const objectKey = assetObjectKey(userId, id, upload.extension);

  const { error } = await db.from("assets").insert({
    id,
    owner_id: userId,
    kind: upload.kind,
    mime_type: upload.mimeType,
    file_name: upload.fileName,
    object_key: objectKey,
    bytes: upload.bytes,
    sha256: upload.sha256,
  });
  if (error) {
    // The quota triggers raise 23514 with a message written for the uploader.
    if (error.code === "23514") throw new AssetRejected(error.message);
    throw new Error(error.message);
  }

  return { ...upload, id, objectKey };
}

/**
 * Admits or refuses the bytes that were actually stored. Until this succeeds the
 * asset stays `uploading`, which no read policy matches, so an unverified object
 * is never readable by anyone but its owner and can never be made public.
 */
export async function completeAssetUpload(assetId: string, userId: string) {
  const admin = createAdminClient();
  const { data: asset, error } = await admin
    .from("assets")
    .select("*")
    .eq("id", assetId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!asset || asset.owner_id !== userId)
    throw new AdminAuthorizationError(403, "This asset is not yours.");
  if (asset.status === "ready") return { id: assetId, status: "ready" as const };

  const download = await admin.storage.from(ASSET_BUCKET).download(asset.object_key);
  if (download.error || !download.data)
    throw new AssetRejected("The uploaded file could not be read back.");

  const bytes = new Uint8Array(await download.data.arrayBuffer());
  const digest = createHash("sha256").update(bytes).digest("hex");

  try {
    inspectAssetBytes(
      bytes,
      {
        kind: asset.kind,
        mimeType: asset.mime_type,
        bytes: asset.bytes,
        sha256: asset.sha256,
      },
      digest,
    );
  } catch (rejection) {
    if (!(rejection instanceof AssetRejected)) throw rejection;
    // Refused bytes are taken out of storage rather than left to be paid for,
    // and the row is kept so the uploader can be told why.
    await admin
      .from("assets")
      .update({ status: "failed", error: rejection.message })
      .eq("id", assetId);
    await admin.from("asset_deletions").insert({
      asset_id: assetId,
      bucket: ASSET_BUCKET,
      object_key: asset.object_key,
      reason: "failed_upload",
    });
    throw rejection;
  }

  const { error: readyError } = await admin
    .from("assets")
    .update({ status: "ready", error: null })
    .eq("id", assetId);
  if (readyError) throw new Error(readyError.message);

  return { id: assetId, status: "ready" as const };
}
