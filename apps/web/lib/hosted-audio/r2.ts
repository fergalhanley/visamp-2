import "server-only";

import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createHash, randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { inspectMp3, InvalidAudioError } from "./inspect-mp3";

const PLAYBACK_TTL_SECONDS = 3600;

/** Only the exact incoming object is writable, for 15 minutes. No read URL
 * for source masters is ever sent to a browser. Content length is signed. */
export async function signMasterUpload(
  key: string,
  bytes: number,
  contentType: string,
) {
  return getSignedUrl(
    client(),
    new PutObjectCommand({
      Bucket: config().mastersBucket,
      Key: key,
      ContentLength: bytes,
      ContentType: contentType,
      StorageClass: "STANDARD",
    }),
    { expiresIn: 900 },
  );
}

export async function inspectMasterUpload(key: string) {
  return client().send(
    new HeadObjectCommand({ Bucket: config().mastersBucket, Key: key }),
  );
}

/** Freeze the upload before inspecting it: its PUT URL may still be writable.
 * Unique candidate keys keep simultaneous completion requests isolated. The DB
 * picks one winner; old unreferenced candidates are safe for orphan cleanup.
 */
export async function prepareMp3Upload(job: {
  id: string;
  object_key: string;
  bytes: number;
  sha256: string;
}) {
  const { mastersBucket, mediaBucket } = config();
  const object = await inspectMasterUpload(job.object_key);
  if (object.ContentLength !== job.bytes || !object.ETag)
    throw new InvalidAudioError(
      "The uploaded file size does not match. Please upload it again.",
    );
  const attempt = randomUUID();
  const masterKey = `${job.id}/${attempt}/original.mp3`;
  const mediaKey = `hosted-audio/${job.id}/${attempt}/original.mp3`;
  const directory = await mkdtemp(join(tmpdir(), "visamp-mp3-"));
  try {
    await client().send(
      new CopyObjectCommand({
        Bucket: mastersBucket,
        Key: masterKey,
        CopySource: `${mastersBucket}/${job.object_key}`,
        CopySourceIfMatch: object.ETag,
        MetadataDirective: "REPLACE",
        ContentType: "audio/mpeg",
      }),
    );
    const frozen = await client().send(
      new GetObjectCommand({ Bucket: mastersBucket, Key: masterKey }),
    );
    if (!frozen.Body || frozen.ContentLength !== job.bytes)
      throw new InvalidAudioError(
        "The uploaded file is incomplete. Please upload it again.",
      );
    const hash = createHash("sha256");
    let bytes = 0;
    const meter = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        bytes += chunk.length;
        if (bytes > job.bytes)
          return callback(
            new InvalidAudioError("The uploaded file is too large."),
          );
        hash.update(chunk);
        callback(null, chunk);
      },
    });
    const file = join(directory, "original.mp3");
    await pipeline(frozen.Body as Readable, meter, createWriteStream(file));
    const sha256 = hash.digest("hex");
    if (bytes !== job.bytes || sha256 !== job.sha256)
      throw new InvalidAudioError(
        "The uploaded file does not match. Please upload it again.",
      );
    let audio;
    try {
      audio = await inspectMp3(file);
    } catch (error) {
      if (error instanceof InvalidAudioError) throw error;
      throw new InvalidAudioError(
        "This MP3 could not be read. Please export it again.",
      );
    }
    await client().send(
      new CopyObjectCommand({
        Bucket: mediaBucket,
        Key: mediaKey,
        CopySource: `${mastersBucket}/${masterKey}`,
        MetadataDirective: "REPLACE",
        ContentType: "audio/mpeg",
      }),
    );
    return { masterKey, mediaKey, sha256, ...audio };
  } catch (error) {
    // No DB publication has been attempted yet, so these candidates are unused.
    await Promise.allSettled([
      deleteR2Object("visamp-masters", masterKey),
      deleteR2Object("media-visamp-io", mediaKey),
    ]);
    throw error;
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

interface R2Config {
  mediaBucket: string;
  mastersBucket: string;
}

let s3: S3Client | null = null;

function config(): R2Config {
  return {
    mediaBucket: process.env.R2_MEDIA_BUCKET ?? "media-visamp-io",
    mastersBucket: process.env.R2_MASTERS_BUCKET ?? "visamp-masters",
  };
}

function client(): S3Client {
  if (s3) return s3;

  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error("Cloudflare R2 credentials are not configured");
  }

  s3 = new S3Client({
    region: "auto",
    requestChecksumCalculation: "WHEN_REQUIRED",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });
  return s3;
}

export async function signMediaObject(key: string): Promise<{
  url: string;
  expiresAt: string;
}> {
  const issuedAt = Date.now();
  const url = await getSignedUrl(
    client(),
    new GetObjectCommand({ Bucket: config().mediaBucket, Key: key }),
    { expiresIn: PLAYBACK_TTL_SECONDS },
  );

  return {
    url,
    expiresAt: new Date(issuedAt + PLAYBACK_TTL_SECONDS * 1000).toISOString(),
  };
}

export async function deleteR2Object(
  logicalBucket: "media-visamp-io" | "visamp-masters",
  key: string,
): Promise<void> {
  const buckets = config();
  const Bucket =
    logicalBucket === "media-visamp-io"
      ? buckets.mediaBucket
      : buckets.mastersBucket;
  await client().send(new DeleteObjectCommand({ Bucket, Key: key }));
}

/** Validated, re-encoded artwork only; never accepts a client-supplied key. */
export async function putMediaObject(key: string, body: Buffer, contentType: string) {
  await client().send(new PutObjectCommand({
    Bucket: config().mediaBucket, Key: key, Body: body, ContentType: contentType,
  }));
}
