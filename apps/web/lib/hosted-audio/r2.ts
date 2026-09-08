import "server-only";

import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const PLAYBACK_TTL_SECONDS = 3600;

/** Only the exact incoming object is writable, for 15 minutes. No read URL
 * for source masters is ever sent to a browser. Content length is signed. */
export async function signMasterUpload(key: string, bytes: number, contentType: string) {
  return getSignedUrl(client(), new PutObjectCommand({
    Bucket: config().mastersBucket, Key: key, ContentLength: bytes,
    ContentType: contentType, StorageClass: "STANDARD",
  }), { expiresIn: 900 });
}

export async function inspectMasterUpload(key: string) {
  return client().send(new HeadObjectCommand({ Bucket: config().mastersBucket, Key: key }));
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
