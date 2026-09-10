#!/usr/bin/env node

import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, extname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { createClient } from "@supabase/supabase-js";

const args = parseArgs(process.argv.slice(2));
const input = resolve(requiredArg(args, "input"));
const inputFormat = extname(input).toLowerCase() === ".flac" ? "flac"
  : [".aif", ".aiff"].includes(extname(input).toLowerCase()) ? "aiff" : "wav";
const artworkInput =
  typeof args.artwork === "string" ? resolve(args.artwork) : null;
const artistSlug = requiredArg(args, "artist-slug");
const licenceId = requiredArg(args, "licence");
const title = requiredArg(args, "title");
const resumeId = typeof args.resume === "string" ? args.resume : null;

const supabaseUrl = requiredEnv("NEXT_PUBLIC_SUPABASE_URL");
const serviceKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
const accountId = requiredEnv("R2_ACCOUNT_ID");
const accessKeyId = requiredEnv("R2_ACCESS_KEY_ID");
const secretAccessKey = requiredEnv("R2_SECRET_ACCESS_KEY");
const mediaBucket = process.env.R2_MEDIA_BUCKET ?? "media-visamp-io";
const mastersBucket = process.env.R2_MASTERS_BUCKET ?? "visamp-masters";

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId, secretAccessKey },
});

let trackId = resumeId;
const work = await mkdtemp(join(tmpdir(), "visamp-audio-ingest-"));

try {
  ensureBinary("ffmpeg");
  ensureBinary("ffprobe");

  const inputExtension = extname(input).toLowerCase();
  if (![".wav", ".flac", ".aif", ".aiff"].includes(inputExtension)) {
    throw new Error(
      "Master must be WAV, FLAC, AIFF or AIF; known lossy inputs are rejected",
    );
  }

  const probe = JSON.parse(
    run("ffprobe", [
      "-v",
      "error",
      "-show_format",
      "-show_streams",
      "-of",
      "json",
      "-f", inputFormat,
      input,
    ]),
  );
  const audioStream = probe.streams?.find(
    (stream) => stream.codec_type === "audio",
  );
  if (!audioStream) throw new Error("Input contains no audio stream");
  if (audioStream.codec_name !== "flac" && !/^pcm_(?:s|u|f)\d/.test(audioStream.codec_name ?? ""))
    throw new Error("Master audio must use a lossless PCM or FLAC codec");
  const sampleRate = Number(audioStream.sample_rate);
  const durationSeconds = Number(
    audioStream.duration ?? probe.format?.duration,
  );
  if (!Number.isFinite(sampleRate) || sampleRate < 44_100) {
    throw new Error("Master sample rate must be at least 44.1 kHz");
  }
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    throw new Error("Could not determine a positive track duration");
  }
  if (durationSeconds > 1800) throw new Error("Tracks must be 30 minutes or shorter");

  const checksum = await sha256(input);
  const { data: artist, error: artistError } = await supabase
    .from("music_artists")
    .select("id, slug")
    .eq("slug", artistSlug)
    .maybeSingle();
  if (artistError) throw artistError;
  if (!artist) throw new Error(`Music artist '${artistSlug}' does not exist`);

  const { data: licence, error: licenceError } = await supabase
    .from("licences")
    .select("*")
    .eq("id", licenceId)
    .maybeSingle();
  if (licenceError) throw licenceError;
  if (!licence || !licenceGrantsIngest(licence, artist.id)) {
    throw new Error(
      "Licence is not currently valid for this artist and all required grants",
    );
  }

  const { data: duplicate, error: duplicateError } = await supabase
    .from("tracks")
    .select("id, music_artist_id, status, master_sha256")
    .eq("master_sha256", checksum)
    .maybeSingle();
  if (duplicateError) throw duplicateError;

  const masterExtension = inputExtension === ".aif" ? ".aiff" : inputExtension;
  if (resumeId) {
    const { data: target, error } = await supabase
      .from("tracks")
      .select("id, music_artist_id, licence_id, status, master_sha256")
      .eq("id", resumeId)
      .maybeSingle();
    if (error) throw error;
    if (
      !target ||
      target.music_artist_id !== artist.id ||
      target.licence_id !== licenceId ||
      target.master_sha256 !== checksum ||
      !["ingesting", "draft"].includes(target.status)
    ) {
      throw new Error(
        "Resume target does not match checksum, artist, or resumable state",
      );
    }
  } else {
    if (duplicate) {
      throw new Error(
        `Master already belongs to track ${duplicate.id}; use --resume explicitly`,
      );
    }
    trackId = randomUUID();
    const slug = typeof args.slug === "string" ? args.slug : slugify(title);
    const { error } = await supabase.from("tracks").insert({
      id: trackId,
      slug,
      music_artist_id: artist.id,
      licence_id: licenceId,
      status: "ingesting",
      title,
      album: stringArg(args, "album"),
      year: numberArg(args, "year"),
      isrc: stringArg(args, "isrc"),
      bpm: numberArg(args, "bpm"),
      musical_key: stringArg(args, "key"),
      genre_tags: listArg(args, "genres"),
      is_explicit: args.explicit === true,
      download_allowed: args["download-allowed"] === true,
      duration_ms: Math.round(durationSeconds * 1000),
      master_sha256: checksum,
      master_key: `${trackId}/original${masterExtension}`,
    });
    if (error) throw error;
  }

  if (!trackId) throw new Error("Track id was not established");
  const masterKey = `${trackId}/original${masterExtension}`;
  console.log(`Ingesting ${trackId}: ${title}`);

  await uploadFile(
    mastersBucket,
    masterKey,
    input,
    contentTypeForMaster(masterExtension),
    {
      StorageClass: "STANDARD_IA",
    },
  );

  const measurementText = run(
    "ffmpeg",
    [
      "-hide_banner",
      "-nostats",
      "-i",
      input,
      "-af",
      "loudnorm=I=-14:TP=-1:LRA=11:print_format=json",
      "-f",
      "null",
      "-",
    ],
    true,
  );
  const measurement = parseLoudnorm(measurementText);
  const normalizer = [
    "loudnorm=I=-14:TP=-1:LRA=11",
    `measured_I=${measurement.input_i}`,
    `measured_TP=${measurement.input_tp}`,
    `measured_LRA=${measurement.input_lra}`,
    `measured_thresh=${measurement.input_thresh}`,
    `offset=${measurement.target_offset}`,
    "linear=true",
  ].join(":");

  const opusFile = join(work, "track.opus");
  const aacFile = join(work, "track.m4a");
  const opusArgs = [
    "-y",
    "-hide_banner",
    "-i",
    input,
    "-map",
    "0:a:0",
    "-vn",
    "-af",
    normalizer,
    "-ar",
    "48000",
    "-ac",
    "2",
    "-c:a",
    "libopus",
    "-b:a",
    "96k",
    "-vbr",
    "on",
    opusFile,
  ];
  const aacArgs = [
    "-y",
    "-hide_banner",
    "-i",
    input,
    "-map",
    "0:a:0",
    "-vn",
    "-af",
    normalizer,
    "-ar",
    "44100",
    "-ac",
    "2",
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-movflags",
    "+faststart",
    aacFile,
  ];
  run("ffmpeg", opusArgs);
  run("ffmpeg", aacArgs);

  verifyRendition(opusFile, durationSeconds, "opus");
  verifyRendition(aacFile, durationSeconds, "aac");
  const opusLoudness = measureLoudness(opusFile);
  const aacLoudness = measureLoudness(aacFile);
  verifyOutputLoudness(opusLoudness, "Opus");
  verifyOutputLoudness(aacLoudness, "AAC");

  const rawPeaks = runBuffer("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-i",
    opusFile,
    "-map",
    "0:a:0",
    "-ac",
    "1",
    "-ar",
    "8000",
    "-f",
    "s16le",
    "-",
  ]);
  const peaks = createPeaks(rawPeaks, 1000);
  const peaksFile = join(work, "peaks.json");
  await writeFile(peaksFile, JSON.stringify(peaks));

  const renditionId = randomId();
  const assetId = randomId();
  const prefix = `hosted-audio/${trackId}`;
  const opusKey = `${prefix}/${renditionId}.opus`;
  const aacKey = `${prefix}/${renditionId}.m4a`;
  const peaksKey = `${prefix}/peaks-${assetId}.json`;

  let artwork512Key = null;
  let artwork1024Key = null;
  let artwork512File = null;
  let artwork1024File = null;
  if (artworkInput) {
    artwork512File = join(work, "art-512.webp");
    artwork1024File = join(work, "art-1024.webp");
    renderArtwork(artworkInput, artwork512File, 512);
    renderArtwork(artworkInput, artwork1024File, 1024);
    artwork512Key = `${prefix}/art-512-${assetId}.webp`;
    artwork1024Key = `${prefix}/art-1024-${assetId}.webp`;
  }

  await uploadFile(mediaBucket, opusKey, opusFile, "audio/ogg");
  await uploadFile(mediaBucket, aacKey, aacFile, "audio/mp4");
  await uploadFile(mediaBucket, peaksKey, peaksFile, "application/json");
  if (artwork512File && artwork512Key) {
    await uploadFile(mediaBucket, artwork512Key, artwork512File, "image/webp");
  }
  if (artwork1024File && artwork1024Key) {
    await uploadFile(
      mediaBucket,
      artwork1024Key,
      artwork1024File,
      "image/webp",
    );
  }

  const ffmpegVersion = run("ffmpeg", ["-version"]).split("\n")[0];
  const provenance = {
    version: 1,
    ingestedAt: new Date().toISOString(),
    sourceFilename: basename(input),
    sha256: checksum,
    ffmpegVersion,
    encodingArguments: { opus: opusArgs, aac: aacArgs },
    probe,
    loudnorm: { input: measurement, opus: opusLoudness, aac: aacLoudness },
    outputs: { opusKey, aacKey, peaksKey, artwork512Key, artwork1024Key },
  };
  await uploadBuffer(
    mastersBucket,
    `${trackId}/original.json`,
    Buffer.from(JSON.stringify(provenance, null, 2)),
    "application/json",
    { StorageClass: "STANDARD_IA" },
  );

  const opusBytes = (await stat(opusFile)).size;
  const aacBytes = (await stat(aacFile)).size;
  const { error: finalizeError } = await supabase.rpc(
    "finalize_hosted_track_ingest",
    {
      p_track_id: trackId,
      p_master_key: masterKey,
      p_peaks_key: peaksKey,
      p_artwork_512_key: artwork512Key,
      p_artwork_1024_key: artwork1024Key,
      p_loudness_in_lufs: Number(measurement.input_i),
      p_loudness_gain_db: Math.min(
        -14 - Number(measurement.input_i),
        -1 - Number(measurement.input_tp),
      ),
      p_renditions: [
        {
          format: "opus",
          object_key: opusKey,
          bitrate_kbps: 96,
          bytes: opusBytes,
        },
        {
          format: "aac",
          object_key: aacKey,
          bitrate_kbps: 128,
          bytes: aacBytes,
        },
      ],
    },
  );
  if (finalizeError) throw finalizeError;

  console.log(
    `Draft ready: http://localhost:3000/api/admin/tracks/${trackId}/playback`,
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  if (trackId)
    console.error(
      `Track ${trackId} remains available for an explicit --resume.`,
    );
  process.exitCode = 1;
} finally {
  await rm(work, { recursive: true, force: true });
}

function parseArgs(values) {
  const parsed = {};
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (!value.startsWith("--"))
      throw new Error(`Unexpected argument: ${value}`);
    const name = value.slice(2);
    const next = values[index + 1];
    if (["explicit", "download-allowed"].includes(name)) parsed[name] = true;
    else if (next === undefined) throw new Error(`--${name} requires a value`);
    else {
      parsed[name] = next;
      index += 1;
    }
  }
  return parsed;
}

function requiredArg(parsed, name) {
  const value = parsed[name];
  if (typeof value !== "string" || !value.trim())
    throw new Error(`--${name} is required`);
  return value.trim();
}

function stringArg(parsed, name) {
  return typeof parsed[name] === "string" ? parsed[name] : null;
}

function numberArg(parsed, name) {
  if (typeof parsed[name] !== "string") return null;
  const value = Number(parsed[name]);
  if (!Number.isFinite(value)) throw new Error(`--${name} must be a number`);
  return value;
}

function listArg(parsed, name) {
  return typeof parsed[name] === "string"
    ? parsed[name]
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
    : [];
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function slugify(value) {
  const slug = value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  if (!slug) throw new Error("Could not derive a track slug; supply --slug");
  return slug;
}

function ensureBinary(name) {
  const result = spawnSync(name, ["-version"], { encoding: "utf8" });
  if (result.error?.code === "ENOENT")
    throw new Error(`${name} is required but was not found`);
  if (result.status !== 0) throw new Error(`${name} could not be executed`);
}

function run(command, commandArgs, returnStderr = false) {
  const result = spawnSync(command, safeMediaArgs(command, commandArgs), {
    encoding: "utf8",
    timeout: 180000,
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(
      `${command} failed:\n${(result.stderr || result.stdout).slice(-4000)}`,
    );
  }
  return returnStderr ? result.stderr : result.stdout;
}

function runBuffer(command, commandArgs) {
  const result = spawnSync(command, safeMediaArgs(command, commandArgs), {
    timeout: 180000,
    maxBuffer: 512 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(
      `${command} failed:\n${result.stderr?.toString().slice(-4000)}`,
    );
  }
  return result.stdout;
}

// Force the declared lossless container on artist-supplied input. A renamed
// playlist must never cause FFmpeg to follow local file references.
function safeMediaArgs(command, values) {
  const args = [...values];
  const inputIndex = args.findIndex((value, index) => value === "-i" && args[index + 1] === input);
  if (command === "ffmpeg" && inputIndex !== -1) args.splice(inputIndex, 0, "-f", inputFormat);
  return ["-protocol_whitelist", "file,pipe", ...args];
}

function parseLoudnorm(text) {
  const matches = text.match(/\{\s*"input_i"[\s\S]*?\}/g);
  if (!matches?.length)
    throw new Error("ffmpeg did not return loudnorm measurement JSON");
  return JSON.parse(matches.at(-1));
}

function measureLoudness(file) {
  return parseLoudnorm(
    run(
      "ffmpeg",
      [
        "-hide_banner",
        "-nostats",
        "-i",
        file,
        "-af",
        "loudnorm=I=-14:TP=-1:LRA=11:print_format=json",
        "-f",
        "null",
        "-",
      ],
      true,
    ),
  );
}

function verifyOutputLoudness(measurement, label) {
  const integrated = Number(measurement.input_i);
  const truePeak = Number(measurement.input_tp);
  if (!Number.isFinite(integrated) || Math.abs(integrated + 14) > 0.75) {
    throw new Error(
      `${label} rendition missed the -14 LUFS target (${integrated})`,
    );
  }
  if (!Number.isFinite(truePeak) || truePeak > -0.8) {
    throw new Error(
      `${label} rendition exceeded the -1 dBTP ceiling (${truePeak})`,
    );
  }
}

function verifyRendition(file, expectedDuration, expectedCodec) {
  const probe = JSON.parse(
    run("ffprobe", [
      "-v",
      "error",
      "-show_format",
      "-show_streams",
      "-of",
      "json",
      file,
    ]),
  );
  const stream = probe.streams?.find((item) => item.codec_type === "audio");
  const duration = Number(stream?.duration ?? probe.format?.duration);
  if (!stream || stream.codec_name !== expectedCodec) {
    throw new Error(`Expected ${expectedCodec} output from ${basename(file)}`);
  }
  if (!Number.isFinite(duration) || Math.abs(duration - expectedDuration) > 1) {
    throw new Error(
      `Rendition duration differs from the master: ${basename(file)}`,
    );
  }
}

function createPeaks(pcm, buckets) {
  const samples = Math.floor(pcm.length / 2);
  const values = new Int8Array(buckets * 2);
  for (let bucket = 0; bucket < buckets; bucket += 1) {
    const start = Math.floor((bucket * samples) / buckets);
    const end = Math.max(
      start + 1,
      Math.floor(((bucket + 1) * samples) / buckets),
    );
    let min = 32767;
    let max = -32768;
    for (let sample = start; sample < Math.min(end, samples); sample += 1) {
      const value = pcm.readInt16LE(sample * 2);
      if (value < min) min = value;
      if (value > max) max = value;
    }
    values[bucket * 2] = Math.max(-127, Math.round((min / 32768) * 127));
    values[bucket * 2 + 1] = Math.min(127, Math.round((max / 32767) * 127));
  }
  return {
    version: 1,
    channels: 1,
    buckets,
    bits: 8,
    encoding: "base64-int8",
    data: Buffer.from(values.buffer).toString("base64"),
  };
}

function renderArtwork(source, output, size) {
  run("ffmpeg", [
    "-y",
    "-hide_banner",
    "-i",
    source,
    "-vf",
    `scale=${size}:${size}:force_original_aspect_ratio=decrease,pad=${size}:${size}:(ow-iw)/2:(oh-ih)/2:color=black`,
    "-frames:v",
    "1",
    "-c:v",
    "libwebp",
    "-quality",
    "85",
    output,
  ]);
}

/**
 * Ingest-grade, deliberately silent about `licences.status`.
 *
 * VIS-86 moved the licence gate from upload to publication: an artist accepts
 * the agreement, which creates a pending licence, and an admin activating it is
 * what releases the music. Processing sits between those two — it has to run
 * before an admin has anything to listen to — and it only ever takes a track as
 * far as `draft`. `enforce_hosted_track_state` still refuses to promote a track
 * to `live` without an active licence, so this staying quiet about status costs
 * nothing and demanding it stranded every self-serve upload.
 *
 * Mirrors uploadLicenceGrantsIngest in lib/hosted-audio/upload-rules.ts. This
 * script is plain .mjs and cannot import it; keep the two in step.
 */
function licenceGrantsIngest(licence, artistId) {
  const today = new Date().toISOString().slice(0, 10);
  return (
    licence.music_artist_id === artistId &&
    licence.signed_at &&
    licence.effective_from &&
    licence.effective_from <= today &&
    (!licence.effective_until || licence.effective_until >= today) &&
    licence.grants_hosting &&
    licence.grants_streaming &&
    licence.grants_transcoding &&
    licence.grants_sync &&
    licence.warrants_master &&
    licence.warrants_publishing
  );
}

async function sha256(file) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}

function randomId() {
  return randomUUID().replaceAll("-", "").slice(0, 12);
}

function contentTypeForMaster(extension) {
  if (extension === ".flac") return "audio/flac";
  if (extension === ".aiff") return "audio/aiff";
  return "audio/wav";
}

async function uploadFile(bucket, key, file, contentType, extra = {}) {
  const info = await stat(file);
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: createReadStream(file),
      ContentLength: info.size,
      ContentType: contentType,
      CacheControl: "private, max-age=300",
      ...extra,
    }),
  );
}

async function uploadBuffer(bucket, key, body, contentType, extra = {}) {
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentLength: body.length,
      ContentType: contentType,
      CacheControl: "private, max-age=300",
      ...extra,
    }),
  );
}
