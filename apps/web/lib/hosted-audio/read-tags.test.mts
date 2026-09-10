/**
 * Run: node --experimental-strip-types --test lib/hosted-audio/read-tags.test.mts
 *
 * Files are synthesised rather than fixtures: each format's header is exactly
 * what is being tested, so building one by hand states the expectation twice —
 * once in the bytes, once in the assertion.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { readTrackTags, titleFromFileName } from "./read-tags.ts";

const file = (bytes: Uint8Array, name: string) =>
  new File([bytes as unknown as BlobPart], name);

function wav({ info }: { info: boolean }): Uint8Array {
  const sampleRate = 44100;
  const channels = 2;
  const byteRate = sampleRate * channels * 2;
  const dataBytes = byteRate * 3; // exactly three seconds
  const infoChunk = info ? 4 + 8 + 12 + 8 + 12 : 0;
  const size = 12 + 8 + 16 + infoChunk + 8 + dataBytes;
  const out = new Uint8Array(size);
  const view = new DataView(out.buffer);
  const put = (at: number, text: string) => {
    for (let i = 0; i < text.length; i += 1) view.setUint8(at + i, text.charCodeAt(i));
  };

  put(0, "RIFF");
  view.setUint32(4, size - 8, true);
  put(8, "WAVE");
  put(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, channels * 2, true);
  view.setUint16(34, 16, true);

  let at = 36;
  if (info) {
    put(at, "LIST");
    view.setUint32(at + 4, 4 + 8 + 12 + 8 + 12, true);
    put(at + 8, "INFO");
    put(at + 12, "INAM");
    view.setUint32(at + 16, 12, true);
    put(at + 20, "Tagged Title");
    put(at + 32, "IART");
    view.setUint32(at + 36, 12, true);
    put(at + 40, "Tagged Artis");
    at += 8 + 4 + 8 + 12 + 8 + 12;
  }
  put(at, "data");
  view.setUint32(at + 4, dataBytes, true);
  return out;
}

function flac(): Uint8Array {
  const comments = ["TITLE=Flac Title", "ARTIST=Flac Artist", "ALBUM=Flac Album", "DATE=2019"];
  const vendor = "visamp-test";
  const encoded = comments.map((c) => new TextEncoder().encode(c));
  const commentSize =
    4 + vendor.length + 4 + encoded.reduce((n, c) => n + 4 + c.length, 0);
  const out = new Uint8Array(4 + 4 + 34 + 4 + commentSize);
  const view = new DataView(out.buffer);
  out.set(new TextEncoder().encode("fLaC"), 0);

  // STREAMINFO: sample rate 48000, 2 channels, 96000 samples => 2000 ms.
  view.setUint8(4, 0);
  view.setUint8(5, 0);
  view.setUint8(6, 0);
  view.setUint8(7, 34);
  // STREAMINFO's body starts at byte 8 (4 magic + 4 block header), and the
  // packed field is its bytes 10-17, so file offsets 18 and 22.
  const hi = (48000 << 12) | ((2 - 1) << 9) | ((16 - 1) << 4) | 0;
  view.setUint32(18, hi >>> 0);
  view.setUint32(22, 96000);

  const at = 4 + 4 + 34;
  view.setUint8(at, 0x80 | 4); // last block, VORBIS_COMMENT
  view.setUint8(at + 1, (commentSize >> 16) & 0xff);
  view.setUint8(at + 2, (commentSize >> 8) & 0xff);
  view.setUint8(at + 3, commentSize & 0xff);

  let cursor = at + 4;
  view.setUint32(cursor, vendor.length, true);
  cursor += 4;
  out.set(new TextEncoder().encode(vendor), cursor);
  cursor += vendor.length;
  view.setUint32(cursor, encoded.length, true);
  cursor += 4;
  for (const c of encoded) {
    view.setUint32(cursor, c.length, true);
    cursor += 4;
    out.set(c, cursor);
    cursor += c.length;
  }
  return out;
}

function aiff(): Uint8Array {
  const name = "Aiff Title";
  const size = 12 + 8 + 18 + 8 + name.length;
  const out = new Uint8Array(size + (name.length % 2));
  const view = new DataView(out.buffer);
  const put = (at: number, text: string) => {
    for (let i = 0; i < text.length; i += 1) view.setUint8(at + i, text.charCodeAt(i));
  };
  put(0, "FORM");
  view.setUint32(4, size - 8);
  put(8, "AIFF");
  put(12, "COMM");
  view.setUint32(16, 18);
  view.setUint16(20, 2); // channels
  view.setUint32(22, 88200); // frames => 2000 ms at 44100
  view.setUint16(26, 16);
  // 44100 as an 80-bit extended float: exponent 16398, mantissa 44100 << 47.
  view.setUint16(28, 16398);
  view.setUint32(30, 0xac440000);
  view.setUint32(34, 0);
  put(38, "NAME");
  view.setUint32(42, name.length);
  put(46, name);
  return out;
}

test("wav duration comes from the byte rate", async () => {
  const tags = await readTrackTags(file(wav({ info: false }), "a.wav"));
  assert.equal(tags.durationMs, 3000);
  assert.equal(tags.sampleRate, 44100);
  assert.equal(tags.channels, 2);
  assert.equal(tags.title, null, "no INFO chunk means no title");
});

test("wav reads a LIST/INFO chunk when one is present", async () => {
  const tags = await readTrackTags(file(wav({ info: true }), "a.wav"));
  assert.equal(tags.title, "Tagged Title");
  assert.equal(tags.artist, "Tagged Artis");
  assert.equal(tags.durationMs, 3000, "the data chunk is still found after LIST");
});

test("flac reads streaminfo and vorbis comments", async () => {
  const tags = await readTrackTags(file(flac(), "a.flac"));
  assert.equal(tags.sampleRate, 48000);
  assert.equal(tags.channels, 2);
  assert.equal(tags.durationMs, 2000);
  assert.equal(tags.title, "Flac Title");
  assert.equal(tags.artist, "Flac Artist");
  assert.equal(tags.album, "Flac Album");
  assert.equal(tags.year, 2019);
});

test("aiff decodes its 80-bit sample rate", async () => {
  const tags = await readTrackTags(file(aiff(), "a.aiff"));
  assert.equal(tags.sampleRate, 44100);
  assert.equal(tags.durationMs, 2000);
  assert.equal(tags.title, "Aiff Title");
});

test("an unreadable file still yields something to upload", async () => {
  const tags = await readTrackTags(file(new Uint8Array([1, 2, 3]), "a.wav"));
  assert.equal(tags.durationMs, null);
  assert.equal(tags.title, null);
});

test("the file name is the fallback title", () => {
  assert.equal(titleFromFileName("03 - Night_Drive.wav"), "Night Drive");
  assert.equal(titleFromFileName("bounce.final.flac"), "bounce final");
  assert.equal(titleFromFileName("07_Reprise.aiff"), "Reprise");
});
