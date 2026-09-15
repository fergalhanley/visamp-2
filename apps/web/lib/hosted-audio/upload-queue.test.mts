import assert from "node:assert/strict";
import test from "node:test";
import { createFileHasher, runUploadQueue } from "./upload-queue.ts";

test("three uploads overlap, a failure frees a slot, and every other row finishes", async () => {
  let inFlight = 0;
  let maximum = 0;
  const complete: number[] = [];
  const failed: number[] = [];
  await runUploadQueue(
    [1, 2, 3, 4, 5, 6],
    async (row) => {
      maximum = Math.max(maximum, ++inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight--;
      if (row === 2) throw new Error("offline");
      complete.push(row);
    },
    (row) => {
      failed.push(row);
    },
    () => true,
  );
  assert.equal(maximum, 3);
  assert.deepEqual(failed, [2]);
  assert.deepEqual(complete.sort(), [1, 3, 4, 5, 6]);
});

test("leaving the page stops new admissions", async () => {
  let active = true;
  const started: number[] = [];
  await runUploadQueue(
    [1, 2, 3, 4, 5],
    async (row) => {
      started.push(row);
      active = false;
    },
    () => assert.fail(),
    () => active,
  );
  assert.deepEqual(started, [1]);
});

test("hashing buffers only one file at a time and recovers after an unreadable file", async () => {
  const hash = createFileHasher();
  let reads = 0;
  let maximum = 0;
  class DelayedBlob extends Blob {
    async arrayBuffer() {
      maximum = Math.max(maximum, ++reads);
      await new Promise((resolve) => setTimeout(resolve, 5));
      reads--;
      return super.arrayBuffer();
    }
  }
  const results = await Promise.all([
    hash(new DelayedBlob(["abc"])),
    hash(new DelayedBlob(["abc"])),
  ]);
  assert.equal(maximum, 1);
  assert.equal(
    results[0],
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  );
  assert.equal(results[1], results[0]);
  class BadBlob extends Blob {
    async arrayBuffer(): Promise<ArrayBuffer> {
      throw new Error("unreadable");
    }
  }
  await assert.rejects(hash(new BadBlob()));
  assert.equal(await hash(new Blob(["abc"])), results[0]);
});
