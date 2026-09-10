#!/usr/bin/env node

import {
  DeleteObjectCommand,
  ListObjectsV2Command,
  S3Client,
} from "@aws-sdk/client-s3";
import { createClient } from "@supabase/supabase-js";

const execute = process.argv.includes("--execute");
const supabaseUrl = required("NEXT_PUBLIC_SUPABASE_URL");
const serviceKey = required("SUPABASE_SERVICE_ROLE_KEY");
const accountId = required("R2_ACCOUNT_ID");
const accessKeyId = required("R2_ACCESS_KEY_ID");
const secretAccessKey = required("R2_SECRET_ACCESS_KEY");
const mediaBucket = process.env.R2_MEDIA_BUCKET ?? "media-visamp-io";
const graceBefore = Date.now() - 7 * 24 * 60 * 60 * 1000;

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId, secretAccessKey },
});

const [
  { data: tracks, error: trackError },
  { data: renditions, error: renditionError },
] = await Promise.all([
  supabase
    .from("tracks")
    .select("peaks_key, artwork_512_key, artwork_1024_key")
    .neq("status", "withdrawn"),
  supabase.from("track_renditions").select("id, object_key, is_current"),
]);
if (trackError) throw trackError;
if (renditionError) throw renditionError;

const referenced = new Set();
for (const track of tracks ?? []) {
  for (const key of [
    track.peaks_key,
    track.artwork_512_key,
    track.artwork_1024_key,
  ]) {
    if (key) referenced.add(key);
  }
}
for (const rendition of renditions ?? []) {
  if (rendition.is_current) referenced.add(rendition.object_key);
}

const renditionRows = new Map(
  (renditions ?? []).map((row) => [row.object_key, row]),
);
let token;
let candidates = 0;
let deleted = 0;

do {
  const page = await s3.send(
    new ListObjectsV2Command({
      Bucket: mediaBucket,
      Prefix: "hosted-audio/",
      ContinuationToken: token,
    }),
  );
  for (const object of page.Contents ?? []) {
    if (!object.Key || !object.LastModified) continue;
    if (
      referenced.has(object.Key) ||
      object.LastModified.getTime() >= graceBefore
    )
      continue;
    candidates += 1;
    console.log(`${execute ? "DELETE" : "WOULD DELETE"} ${object.Key}`);
    if (!execute) continue;

    await s3.send(
      new DeleteObjectCommand({ Bucket: mediaBucket, Key: object.Key }),
    );
    const rendition = renditionRows.get(object.Key);
    if (rendition && !rendition.is_current) {
      const { error } = await supabase
        .from("track_renditions")
        .delete()
        .eq("id", rendition.id)
        .eq("is_current", false);
      if (error) throw error;
    }
    const { error: outboxError } = await supabase
      .from("track_asset_deletions")
      .update({ completed_at: new Date().toISOString(), last_error: null })
      .eq("bucket", "media-visamp-io")
      .eq("object_key", object.Key)
      .is("completed_at", null);
    if (outboxError) throw outboxError;
    deleted += 1;
  }
  token = page.IsTruncated ? page.NextContinuationToken : undefined;
} while (token);

console.log(
  execute
    ? `Deleted ${deleted} of ${candidates} eligible objects.`
    : `${candidates} objects eligible. Re-run with --execute to delete.`,
);

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}
