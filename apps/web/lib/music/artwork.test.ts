// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
import sharp from "sharp";
vi.mock("server-only", () => ({}));
const put = vi.hoisted(() => vi.fn());
vi.mock("@/lib/hosted-audio/r2", () => ({ putMediaObject: put }));
vi.mock("@/lib/rate-limit", () => ({
  checkApiRateLimit: async () => ({ allowed: true }),
}));
import { uploadArtwork } from "./artwork";
beforeEach(() => put.mockReset());
function request(bytes: Uint8Array, type = "image/png") {
  return new Request("http://localhost/artwork", {
    method: "POST",
    headers: { origin: "http://localhost", "content-type": type },
    body: new Uint8Array(bytes),
  });
}
it("decodes and bounds artwork before storing a new server-generated WebP key", async () => {
  const png = await sharp({
    create: { width: 2000, height: 1000, channels: 3, background: "blue" },
  })
    .png()
    .toBuffer();
  const key = await uploadArtwork(request(png), "track-artwork/test");
  expect(key).toMatch(/^track-artwork\/test\/[a-f0-9-]+\.webp$/);
  const metadata = await sharp(put.mock.calls[0]![1]).metadata();
  expect(metadata).toMatchObject({ format: "webp", width: 1024, height: 512 });
  expect(metadata.exif).toBeUndefined();
});
it("rejects fake image content and oversized uploads without storing them", async () => {
  await expect(
    uploadArtwork(request(new TextEncoder().encode("not an image")), "test"),
  ).rejects.toMatchObject({ status: 400 });
  await expect(
    uploadArtwork(request(new Uint8Array(4 * 1024 * 1024 + 1)), "test"),
  ).rejects.toMatchObject({ status: 413 });
  expect(put).not.toHaveBeenCalled();
});
it("refuses active image formats and cross-origin requests", async () => {
  await expect(
    uploadArtwork(
      request(new TextEncoder().encode("<svg/>"), "image/svg+xml"),
      "test",
    ),
  ).rejects.toMatchObject({ status: 400 });
  await expect(
    uploadArtwork(
      new Request("http://localhost/artwork", {
        method: "POST",
        headers: { origin: "https://elsewhere.test" },
      }),
      "test",
    ),
  ).rejects.toMatchObject({ status: 403 });
  expect(put).not.toHaveBeenCalled();
});
it("crops artist banners to a wide, bounded WebP without retaining metadata", async () => {
  const png = await sharp({ create: { width: 3000, height: 2000, channels: 3, background: "green" } }).png().toBuffer();
  await uploadArtwork(request(png), "artist-banners/test", "banner");
  expect(await sharp(put.mock.calls[0]![1]).metadata()).toMatchObject({ format: "webp", width: 2400, height: 800 });
});
