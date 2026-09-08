import assert from "node:assert/strict";
import test from "node:test";
import {
  readUploadDetails,
  uploadLicenceValid,
} from "../lib/hosted-audio/upload-rules.ts";

const licence = {
  status: "active",
  signed_at: "2026-01-01T00:00:00Z",
  effective_from: "2026-01-01",
  effective_until: "2026-12-31",
  grants_hosting: true,
  grants_streaming: true,
  grants_transcoding: true,
  grants_sync: true,
  warrants_master: true,
  warrants_publishing: true,
};
test("uploads require a signed, current licence and every grant and warranty", () => {
  assert.equal(uploadLicenceValid(licence, "2026-09-07"), true);
  for (const flag of [
    "grants_hosting",
    "grants_streaming",
    "grants_transcoding",
    "grants_sync",
    "warrants_master",
    "warrants_publishing",
  ]) {
    assert.equal(
      uploadLicenceValid({ ...licence, [flag]: false }, "2026-09-07"),
      false,
      flag,
    );
  }
  for (const patch of [
    { status: "pending" },
    { status: "terminated" },
    { signed_at: null },
    { effective_from: null },
    { effective_from: "2027-01-01" },
    { effective_until: "2026-09-06" },
  ]) {
    assert.equal(
      uploadLicenceValid({ ...licence, ...patch }, "2026-09-07"),
      false,
    );
  }
  assert.equal(
    uploadLicenceValid({ ...licence, effective_until: null }, "2026-09-07"),
    true,
  );
});
test("metadata parsing rejects malformed JSON and empty bodies", async () => {
  await assert.rejects(
    readUploadDetails(new Request("https://visamp.io", { method: "POST" })),
    SyntaxError,
  );
  await assert.rejects(
    readUploadDetails(
      new Request("https://visamp.io", { method: "POST", body: "{" }),
    ),
    SyntaxError,
  );
  assert.deepEqual(
    await readUploadDetails(
      new Request("https://visamp.io", {
        method: "POST",
        body: '{"title":"Sound"}',
      }),
    ),
    { title: "Sound" },
  );
});
test("chunked oversized metadata cancels before buffering more than 4 KB", async () => {
  let cancelled = false;
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(2048));
      controller.enqueue(new Uint8Array(2049));
    },
    cancel() {
      cancelled = true;
    },
  });
  const request = new Request("https://visamp.io", {
    method: "POST",
    body: stream,
    duplex: "half",
  });
  await assert.rejects(readUploadDetails(request), RangeError);
  assert.equal(cancelled, true);
});
