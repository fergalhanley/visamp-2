#!/usr/bin/env node
// Run one bounded batch on a machine with FFmpeg. Never run inside a web request.
import { createHash } from "node:crypto";
import { createWriteStream, createReadStream } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import {
  GetObjectCommand,
  S3Client,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { createClient } from "@supabase/supabase-js";

function required(name) {
  if (!process.env[name]) throw new Error(name + " is required");
  return process.env[name];
}
const db = createClient(
  required("NEXT_PUBLIC_SUPABASE_URL"),
  required("SUPABASE_SERVICE_ROLE_KEY"),
  { auth: { persistSession: false, autoRefreshToken: false } },
);
const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${required("R2_ACCOUNT_ID")}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: required("R2_ACCESS_KEY_ID"),
    secretAccessKey: required("R2_SECRET_ACCESS_KEY"),
  },
});
const bucket = process.env.R2_MASTERS_BUCKET ?? "visamp-masters";
for (const binary of ["ffmpeg", "ffprobe"]) {
  const checked = spawnSync(binary, ["-version"], {
    timeout: 10000,
    stdio: "ignore",
  });
  if (checked.status !== 0)
    throw new Error(binary + " must be installed before processing uploads.");
}
/**
 * A rejected track is not a broken worker.
 *
 * On a schedule the exit code is the only signal anyone watches, so a single
 * unusable master must not turn the run red — do that and every run is red,
 * and the alert stops meaning anything. A job that fails is recorded against
 * its own row, where an admin can see it. Only the worker itself failing —
 * missing ffmpeg, bad credentials, a database that will not answer — is worth
 * waking someone for, and those throw out of this loop.
 */
let processed = 0;
let rejected = 0;

// No reclaim timer: a crashed processing job needs operator review before retry,
// so a second worker cannot race the first and create duplicate tracks.
for (let index = 0; index < 10; index++) {
  const claimed = await db.rpc("claim_audio_upload");
  if (claimed.error) throw claimed.error;
  const job = claimed.data?.[0];
  if (!job) {
    console.log("No queued uploads.");
    break;
  }
  const work = await mkdtemp(join(tmpdir(), "visamp-submission-"));
  try {
    const artist = await db
      .from("music_artists")
      .select("slug,claimed_by")
      .eq("id", job.music_artist_id)
      .single();
    if (artist.error) throw artist.error;
    if (artist.data.claimed_by !== job.user_id) {
      const admin = await db
        .from("app_admins")
        .select("user_id")
        .eq("user_id", job.user_id)
        .maybeSingle();
      if (admin.error || !admin.data)
        throw new Error(
          "Artist ownership changed; upload is no longer authorised.",
        );
    }
    const extension = extname(job.file_name).toLowerCase();
    if (![".wav", ".flac", ".aif", ".aiff"].includes(extension))
      throw new Error("Unsupported source file.");
    const file = join(work, "original" + extension);
    const object = await s3.send(
      new GetObjectCommand({ Bucket: bucket, Key: job.object_key }),
      { abortSignal: AbortSignal.timeout(120000) },
    );
    if (object.ContentLength !== job.bytes || !object.Body)
      throw new Error("Upload size mismatch.");
    let bytes = 0;
    const limit = new Transform({
      transform(chunk, _encoding, callback) {
        bytes += chunk.length;
        callback(
          bytes > job.bytes
            ? new Error("Upload exceeds its declared size.")
            : null,
          chunk,
        );
      },
    });
    await pipeline(
      object.Body,
      limit,
      createWriteStream(file, { flags: "wx" }),
      { signal: AbortSignal.timeout(120000) },
    );
    const hash = createHash("sha256");
    for await (const chunk of createReadStream(file)) hash.update(chunk);
    if (bytes !== job.bytes || hash.digest("hex") !== job.sha256)
      throw new Error("Upload checksum mismatch.");
    const existing = await db
      .from("tracks")
      .select("id,status,music_artist_id,licence_id,slug")
      .eq("master_sha256", job.sha256)
      .maybeSingle();
    if (existing.error) throw existing.error;
    // Stable job slug gives retries ownership of their previous partial ingest.
    const slug = "upload-" + job.id;
    if (
      existing.data &&
      (existing.data.slug !== slug ||
        existing.data.music_artist_id !== job.music_artist_id ||
        existing.data.licence_id !== job.licence_id)
    )
      throw new Error("This recording has already been uploaded.");
    let trackId = existing.data?.id;
    if (!existing.data || existing.data.status === "ingesting") {
      const args = [
        fileURLToPath(new URL("./ingest-hosted-audio.mjs", import.meta.url)),
        "--input",
        file,
        "--artist-slug",
        artist.data.slug,
        "--licence",
        job.licence_id,
        "--title",
        job.title,
        "--slug",
        slug,
      ];
      if (trackId) args.push("--resume", trackId);
      const result = spawnSync(process.execPath, args, { stdio: "inherit" });
      if (result.status !== 0)
        throw new Error(
          "Audio processing failed. An admin can inspect the worker log.",
        );
      const track = await db
        .from("tracks")
        .select("id")
        .eq("slug", slug)
        .single();
      if (track.error) throw track.error;
      trackId = track.data.id;
    } else if (existing.data.status !== "draft")
      throw new Error("Track is no longer a reviewable draft.");
    const completed = await db
      .from("audio_uploads")
      .update({
        status: "completed",
        track_id: trackId,
        finished_at: new Date().toISOString(),
      })
      .eq("id", job.id)
      .eq("status", "processing");
    if (completed.error) throw completed.error;
    // Temporary submission only; the ingest script saved the permanent master.
    try {
      await s3.send(
        new DeleteObjectCommand({ Bucket: bucket, Key: job.object_key }),
      );
    } catch {
      console.warn(
        "Temporary source cleanup pending; incoming/ lifecycle will remove it.",
      );
    }
    console.log("Ready for review:", job.id);
    processed += 1;
  } catch (error) {
    console.error("Upload failed:", job.id, error?.message ?? error);
    const failed = await db
      .from("audio_uploads")
      .update({
        status: "failed",
        error: "Processing failed. Please contact a site admin for review.",
        finished_at: new Date().toISOString(),
      })
      .eq("id", job.id)
      .eq("status", "processing");
    if (failed.error) throw failed.error;
    rejected += 1;
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

console.log(
  `Batch finished: ${processed} processed, ${rejected} rejected.` +
    (rejected ? " Rejected uploads carry their reason on the row." : ""),
);
