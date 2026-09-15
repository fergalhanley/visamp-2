import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { readFile, mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inspectMp3 } from "./inspect-mp3.ts";
import { readTrackTags } from "./read-tags.ts";

const fixture = (name: string) =>
  fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));

test("CBR and VBR MP3s provide duration and bitrate without decoding or changing bytes", async () => {
  for (const [name, seconds] of [
    ["tagged-cbr.mp3", 2],
    ["vbr.mp3", 3],
  ] as const) {
    const path = fixture(name);
    const before = await readFile(path);
    const audio = await inspectMp3(path);
    assert.ok(Math.abs(audio.durationMs - seconds * 1000) < 100);
    assert.ok(audio.bitrateKbps > 0);
    assert.deepEqual(await readFile(path), before);
  }
  assert.equal(
    (await inspectMp3(fixture("tagged-cbr.mp3"))).album,
    "Test Album",
  );
});

test("MP3 tags populate title and artist from the selected file", async () => {
  const data = await readFile(fixture("tagged-cbr.mp3"));
  const tags = await readTrackTags(new File([data], "recording.mp3"));
  assert.equal(tags.title, "Test Recording");
  assert.equal(tags.artist, "Test Artist");
  assert.equal(tags.year, 2026);
});

test("renamed non-audio and empty MP3 files fail verification", async () => {
  const dir = await mkdtemp(join(tmpdir(), "mp3-test-"));
  try {
    const file = join(dir, "fake.mp3");
    for (const body of ["", "<html>not audio</html>", "ID3"]) {
      await writeFile(file, body);
      await assert.rejects(inspectMp3(file));
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
