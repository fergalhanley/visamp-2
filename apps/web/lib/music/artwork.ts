import "server-only";
import sharp from "sharp";
import { randomUUID } from "node:crypto";
import { MusicError, musicRate } from "./api";
import { putMediaObject } from "@/lib/hosted-audio/r2";

export async function uploadArtwork(
  request: Request,
  prefix: string,
  kind: "square" | "banner" = "square",
) {
  await musicRate(request);
  if (request.headers.get("origin") !== new URL(request.url).origin)
    throw new MusicError(403, "Invalid request origin.");
  if (
    !["image/jpeg", "image/png", "image/webp"].includes(
      request.headers.get("content-type") ?? "",
    )
  )
    throw new MusicError(400, "Choose a JPEG, PNG or WebP image.");
  const reader = request.body?.getReader();
  if (!reader) throw new MusicError(400, "Choose an image.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    size += part.value.byteLength;
    if (size > 4 * 1024 * 1024) {
      await reader.cancel();
      throw new MusicError(413, "Choose an image under 4 MB.");
    }
    chunks.push(part.value);
  }
  let image: Buffer;
  try {
    const decoded = sharp(Buffer.concat(chunks), {
      limitInputPixels: 25000000,
      animated: false,
    });
    const metadata = await decoded.metadata();
    if (!metadata.format || !["jpeg", "png", "webp"].includes(metadata.format))
      throw new Error("Unsupported image format");
    image = await decoded
      .rotate()
      .resize(kind === "banner" ? 2400 : 1024, kind === "banner" ? 800 : 1024, {
        fit: kind === "banner" ? "cover" : "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 85 })
      .toBuffer();
  } catch {
    throw new MusicError(
      400,
      "This image could not be read. Choose a JPEG, PNG or WebP image.",
    );
  }
  const key = `${prefix}/${randomUUID()}.webp`;
  await putMediaObject(key, image, "image/webp");
  return key;
}
