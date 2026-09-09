import assert from "node:assert/strict";
import test from "node:test";

import {
  acceptUploadDetails,
  assetObjectKey,
  AssetRejected,
} from "../lib/assets/rules.ts";
import { extractAssetReferences } from "../lib/assets/references.ts";
import { inspectSvg } from "../lib/assets/svg.ts";
import { inspectGlb } from "../lib/assets/glb.ts";
import { inspectBitmap } from "../lib/assets/bitmap.ts";
import { inspectAssetBytes } from "../lib/assets/content.ts";

const SHA = "a".repeat(64);
const OWNER = "11111111-2222-3333-4444-555555555555";
const ASSET = "66666666-7777-8888-9999-aaaaaaaaaaaa";

const rejects = (fn, match) =>
  assert.throws(fn, (error) => {
    assert.ok(error instanceof AssetRejected, `expected AssetRejected, got ${error}`);
    if (match) assert.match(error.message, match);
    return true;
  });

// ── Upload metadata ─────────────────────────────────────────────────────────

test("every accepted extension maps to its kind and media type", () => {
  const cases = [
    ["logo.png", "bitmap", "image/png"],
    ["photo.JPG", "bitmap", "image/jpeg"],
    ["photo.jpeg", "bitmap", "image/jpeg"],
    ["shot.webp", "bitmap", "image/webp"],
    ["mark.svg", "vector", "image/svg+xml"],
    ["ship.glb", "model", "model/gltf-binary"],
  ];
  for (const [fileName, kind, mimeType] of cases) {
    const accepted = acceptUploadDetails({ fileName, bytes: 1024, sha256: SHA });
    assert.equal(accepted.kind, kind, fileName);
    assert.equal(accepted.mimeType, mimeType, fileName);
  }
});

test("unsupported and dangerous extensions are refused", () => {
  for (const fileName of ["model.gltf", "clip.mp4", "run.exe", "page.html", "noextension"]) {
    rejects(() => acceptUploadDetails({ fileName, bytes: 10, sha256: SHA }), /Unsupported/);
  }
});

test("size ceilings are enforced per kind", () => {
  assert.ok(acceptUploadDetails({ fileName: "a.png", bytes: 20 * 1024 * 1024, sha256: SHA }));
  rejects(() => acceptUploadDetails({ fileName: "a.png", bytes: 20 * 1024 * 1024 + 1, sha256: SHA }));
  // SVG is text and gets the smallest allowance; a 3 MB PNG would have passed.
  rejects(() => acceptUploadDetails({ fileName: "a.svg", bytes: 3 * 1024 * 1024, sha256: SHA }));
  assert.ok(acceptUploadDetails({ fileName: "a.glb", bytes: 60 * 1024 * 1024, sha256: SHA }));
  rejects(() => acceptUploadDetails({ fileName: "a.glb", bytes: 61 * 1024 * 1024, sha256: SHA }));
  for (const bytes of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 2, "100"]) {
    rejects(() => acceptUploadDetails({ fileName: "a.png", bytes, sha256: SHA }));
  }
});

test("a checksum and a bounded file name are required", () => {
  rejects(() => acceptUploadDetails({ fileName: "a.png", bytes: 10, sha256: "nope" }));
  rejects(() => acceptUploadDetails({ fileName: "a.png", bytes: 10, sha256: SHA.toUpperCase() }));
  rejects(() => acceptUploadDetails({ fileName: `${"x".repeat(260)}.png`, bytes: 10, sha256: SHA }));
  rejects(() => acceptUploadDetails({ fileName: "   ", bytes: 10, sha256: SHA }));
  for (const body of [null, "string", [], undefined]) rejects(() => acceptUploadDetails(body));
});

test("object keys match the shape the database constraint accepts", () => {
  const key = assetObjectKey(OWNER, ASSET, "png");
  assert.equal(key, `${OWNER}/${ASSET}.png`);
  // Mirrors assets_object_key_shape in the migration.
  assert.match(key, /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.[a-z0-9]+$/);
  assert.ok(key.split("/")[1].startsWith(`${ASSET}.`));
  rejects(() => assetObjectKey("../evil", ASSET, "png"));
  rejects(() => assetObjectKey(OWNER, ASSET, "exe"));
});

// ── Reference extraction ────────────────────────────────────────────────────

test("asset citations are extracted in both spellings, deduplicated", () => {
  const source = `
    render {
      draw::image(asset::bitmap("${ASSET}"))
      draw::image(asset::bitmap("${ASSET}"))
      draw::mesh(asset::model(id: "${OWNER}"))
      draw::rect(x: 1.0)
    }
  `;
  const found = extractAssetReferences(source);
  assert.equal(found.length, 2);
  assert.ok(found.includes(ASSET));
  assert.ok(found.includes(OWNER));
});

test("only real citations count", () => {
  assert.deepEqual(extractAssetReferences(""), []);
  assert.deepEqual(extractAssetReferences(`draw::text("${ASSET}")`), []);
  assert.deepEqual(extractAssetReferences('asset::bitmap("not-a-uuid")'), []);
  assert.deepEqual(extractAssetReferences(`asset::sound("${ASSET}")`), []);
  // Upper-case ids normalise, so the index cannot hold the same asset twice.
  assert.deepEqual(
    extractAssetReferences(`asset::vector("${ASSET.toUpperCase()}")`),
    [ASSET],
  );
});

// ── SVG ─────────────────────────────────────────────────────────────────────

const svg = (inner) =>
  new TextEncoder().encode(`<svg xmlns="http://www.w3.org/2000/svg">${inner}</svg>`);

test("a self-contained SVG is accepted", () => {
  inspectSvg(svg('<rect width="10" height="10" fill="#f00"/>'));
  inspectSvg(svg('<use href="#shape"/><image href="data:image/png;base64,AAAA"/>'));
});

test("executable or externally-dependent SVGs are refused", () => {
  const hostile = [
    "<script>fetch('https://example.com')</script>",
    '<rect onload="alert(1)"/>',
    '<a href="javascript:alert(1)">x</a>',
    '<foreignObject><body/></foreignObject>',
    '<image href="https://example.com/tracker.png"/>',
    '<image xlink:href="//example.com/tracker.png"/>',
    '<style>@import url("https://example.com/x.css")</style>',
    '<rect style="fill:url(https://example.com/x)"/>',
  ];
  for (const inner of hostile) rejects(() => inspectSvg(svg(inner)), /rejected because/);

  rejects(
    () =>
      inspectSvg(
        new TextEncoder().encode(
          '<!DOCTYPE svg [<!ENTITY x "boom">]><svg xmlns="http://www.w3.org/2000/svg"/>',
        ),
      ),
    /entities/,
  );
  rejects(() => inspectSvg(new TextEncoder().encode("<html><body/></html>")), /<svg>/);
  rejects(() => inspectSvg(Uint8Array.from([0xff, 0xfe, 0xff])), /UTF-8/);
});

// ── GLB ─────────────────────────────────────────────────────────────────────

function buildGlb(gltf, { binary = true, magic = 0x46546c67, version = 2, length } = {}) {
  const json = Buffer.from(JSON.stringify(gltf), "utf8");
  const jsonPadding = (4 - (json.length % 4)) % 4;
  const jsonChunk = Buffer.concat([json, Buffer.alloc(jsonPadding, 0x20)]);
  const bin = binary ? Buffer.alloc(4) : Buffer.alloc(0);
  const total = 12 + 8 + jsonChunk.length + (binary ? 8 + bin.length : 0);

  const out = Buffer.alloc(total);
  out.writeUInt32LE(magic, 0);
  out.writeUInt32LE(version, 4);
  out.writeUInt32LE(length ?? total, 8);
  out.writeUInt32LE(jsonChunk.length, 12);
  out.writeUInt32LE(0x4e4f534a, 16);
  jsonChunk.copy(out, 20);
  if (binary) {
    const at = 20 + jsonChunk.length;
    out.writeUInt32LE(bin.length, at);
    out.writeUInt32LE(0x004e4942, at + 4);
    bin.copy(out, at + 8);
  }
  return new Uint8Array(out);
}

const MODEL = { asset: { version: "2.0" }, buffers: [{ byteLength: 4 }] };

test("a self-contained GLB is accepted", () => {
  inspectGlb(buildGlb(MODEL));
  inspectGlb(
    buildGlb({
      asset: { version: "2.0" },
      images: [{ uri: "data:image/png;base64,AAAA" }],
    }, { binary: false }),
  );
});

test("a GLB that depends on files we do not hold is refused", () => {
  rejects(
    () => inspectGlb(buildGlb({ asset: {}, buffers: [{ uri: "scene.bin" }] }, { binary: false })),
    /external files/,
  );
  rejects(
    () =>
      inspectGlb(
        buildGlb({ asset: {}, images: [{ uri: "https://example.com/t.png" }] }, { binary: false }),
      ),
    /external files/,
  );
  // No URI means "in the binary chunk", so the binary chunk has to be there.
  rejects(() => inspectGlb(buildGlb(MODEL, { binary: false })), /missing binary chunk/);
});

test("malformed GLB containers are refused", () => {
  rejects(() => inspectGlb(buildGlb(MODEL, { magic: 0x12345678 })), /not a GLB/);
  rejects(() => inspectGlb(buildGlb(MODEL, { version: 1 })), /glTF 2.0/);
  rejects(() => inspectGlb(buildGlb(MODEL, { length: 4 })), /truncated or has trailing/);
  rejects(() => inspectGlb(buildGlb(MODEL).slice(0, 8)), /too small/);
  const corrupt = buildGlb(MODEL);
  new DataView(corrupt.buffer).setUint32(12, 4096, true); // JSON chunk past the end
  rejects(() => inspectGlb(corrupt), /past its end/);
});

// ── Bitmaps ─────────────────────────────────────────────────────────────────

function png(width, height) {
  const out = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(out, 0);
  out.write("IHDR", 12, "ascii");
  out.writeUInt32BE(width, 16);
  out.writeUInt32BE(height, 20);
  return new Uint8Array(out);
}

function jpeg(width, height) {
  const out = Buffer.alloc(20);
  Buffer.from([0xff, 0xd8, 0xff, 0xe0]).copy(out, 0);
  out.writeUInt16BE(4, 4); // APP0 length
  out.writeUInt8(0xff, 8);
  out.writeUInt8(0xc0, 9); // SOF0
  out.writeUInt16BE(11, 10);
  out.writeUInt8(8, 12);
  out.writeUInt16BE(height, 13);
  out.writeUInt16BE(width, 15);
  return new Uint8Array(out);
}

function webp(width, height) {
  const out = Buffer.alloc(30);
  out.write("RIFF", 0, "ascii");
  out.writeUInt32LE(22, 4);
  out.write("WEBP", 8, "ascii");
  out.write("VP8X", 12, "ascii");
  out.writeUInt32LE(10, 16);
  out.writeUIntLE(width - 1, 24, 3);
  out.writeUIntLE(height - 1, 27, 3);
  return new Uint8Array(out);
}

test("bitmap dimensions are read from the file itself", () => {
  assert.deepEqual(inspectBitmap(png(800, 600), "image/png"), {
    mimeType: "image/png",
    width: 800,
    height: 600,
  });
  assert.deepEqual(inspectBitmap(jpeg(1920, 1080), "image/jpeg"), {
    mimeType: "image/jpeg",
    width: 1920,
    height: 1080,
  });
  assert.deepEqual(inspectBitmap(webp(640, 480), "image/webp"), {
    mimeType: "image/webp",
    width: 640,
    height: 480,
  });
});

test("content that disagrees with its extension is refused", () => {
  rejects(() => inspectBitmap(png(10, 10), "image/jpeg"), /is a PNG, not a JPEG/);
  rejects(() => inspectBitmap(new Uint8Array(64), "image/png"), /not a readable/);
  // An SVG renamed to .png would otherwise skip the SVG rules entirely.
  rejects(() => inspectBitmap(svg("<rect/>"), "image/png"), /not a readable/);
});

test("decompression bombs are refused on declared size", () => {
  rejects(() => inspectBitmap(png(40000, 40000), "image/png"), /larger than the/);
  assert.ok(inspectBitmap(png(8192, 8192), "image/png"));
  rejects(() => inspectBitmap(png(0, 10), "image/png"), /no dimensions/);
});

// ── The gate as a whole ─────────────────────────────────────────────────────

test("stored bytes must match what the uploader declared", () => {
  const bytes = png(10, 10);
  const upload = {
    kind: "bitmap",
    mimeType: "image/png",
    bytes: bytes.byteLength,
    sha256: SHA,
  };
  assert.deepEqual(inspectAssetBytes(bytes, upload, SHA), { width: 10, height: 10 });
  rejects(
    () => inspectAssetBytes(bytes, { ...upload, bytes: bytes.byteLength + 1 }, SHA),
    /declared size/,
  );
  rejects(() => inspectAssetBytes(bytes, upload, "b".repeat(64)), /checksum/);
});
