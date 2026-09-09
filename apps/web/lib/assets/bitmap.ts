/**
 * VIS-51: bitmap admission.
 *
 * The declared extension is a claim, not evidence, so the container is
 * identified from its own bytes and the dimensions are read from the header.
 * A few kilobytes of PNG can declare a 40000×40000 canvas, which costs gigabytes
 * the moment anything decodes it.
 */

import { AssetRejected, MAX_BITMAP_PIXELS } from "./rules.ts";

export interface BitmapInfo {
  mimeType: string;
  width: number;
  height: number;
}

export function inspectBitmap(bytes: Uint8Array, declared: string): BitmapInfo {
  const info = readBitmap(bytes);
  if (!info)
    throw new AssetRejected("This file is not a readable PNG, JPEG or WebP image.");

  // Catches both a mislabelled upload and a file whose extension was changed to
  // slip past the extension allowlist.
  if (info.mimeType !== declared)
    throw new AssetRejected(
      `This file is a ${info.mimeType.replace("image/", "").toUpperCase()}, not a ${declared
        .replace("image/", "")
        .toUpperCase()}. Rename it or upload it with the right extension.`,
    );

  if (info.width < 1 || info.height < 1)
    throw new AssetRejected("This image has no dimensions.");
  if (info.width * info.height > MAX_BITMAP_PIXELS)
    throw new AssetRejected(
      `This image is ${info.width}×${info.height}, which is larger than the ${Math.sqrt(
        MAX_BITMAP_PIXELS,
      )}×${Math.sqrt(MAX_BITMAP_PIXELS)} pixel limit.`,
    );

  return info;
}

function readBitmap(bytes: Uint8Array): BitmapInfo | null {
  return readPng(bytes) ?? readJpeg(bytes) ?? readWebp(bytes);
}

function view(bytes: Uint8Array): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/**
 * The whole chunk sequence is walked, not just the header. A file carrying a
 * valid IHDR and nothing else has dimensions and no picture: it would be
 * admitted, marked ready, and then fail to render for everyone who opened it.
 */
function readPng(bytes: Uint8Array): BitmapInfo | null {
  if (bytes.byteLength < 24) return null;
  if (PNG_SIGNATURE.some((byte, index) => bytes[index] !== byte)) return null;

  const data = view(bytes);
  let offset = 8;
  let header: BitmapInfo | null = null;
  let pixels = false;
  let end = false;

  while (offset + 12 <= bytes.byteLength) {
    const length = data.getUint32(offset, false);
    const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
    // 4 length + 4 type + data + 4 CRC.
    const next = offset + 12 + length;
    if (length > bytes.byteLength || next > bytes.byteLength) return null;

    if (offset === 8) {
      if (type !== "IHDR" || length !== 13) return null;
      header = {
        mimeType: "image/png",
        width: data.getUint32(offset + 8, false),
        height: data.getUint32(offset + 12, false),
      };
    }
    if (type === "IDAT") pixels = true;
    if (type === "IEND") {
      end = true;
      // IEND is the last chunk; anything after it is not part of the image.
      if (next !== bytes.byteLength) return null;
      break;
    }

    offset = next;
  }

  return header && pixels && end ? header : null;
}

function readJpeg(bytes: Uint8Array): BitmapInfo | null {
  if (bytes.byteLength < 4) return null;
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) return null;
  // A frame header without an end-of-image marker is a truncated download.
  if (bytes[bytes.byteLength - 2] !== 0xff || bytes[bytes.byteLength - 1] !== 0xd9)
    return null;

  const data = view(bytes);
  let offset = 2;
  while (offset + 4 <= bytes.byteLength) {
    if (bytes[offset] !== 0xff) return null;
    const marker = bytes[offset + 1]!;
    // Standalone markers carry no length field.
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }
    const length = data.getUint16(offset + 2, false);
    if (length < 2) return null;
    // Start-of-frame markers hold the dimensions; SOF4/SOF8/SOF12 are not
    // frame headers despite sitting in the same range.
    const isFrameHeader =
      marker >= 0xc0 &&
      marker <= 0xcf &&
      marker !== 0xc4 &&
      marker !== 0xc8 &&
      marker !== 0xcc;
    if (isFrameHeader) {
      if (offset + 9 > bytes.byteLength) return null;
      return {
        mimeType: "image/jpeg",
        height: data.getUint16(offset + 5, false),
        width: data.getUint16(offset + 7, false),
      };
    }
    offset += 2 + length;
  }
  return null;
}

function readWebp(bytes: Uint8Array): BitmapInfo | null {
  if (bytes.byteLength < 30) return null;
  const tag = (start: number) => String.fromCharCode(...bytes.subarray(start, start + 4));
  if (tag(0) !== "RIFF" || tag(8) !== "WEBP") return null;

  // The RIFF header declares the rest of the file; if it disagrees, the file is
  // truncated or padded with something we would never render.
  const data = view(bytes);
  if (data.getUint32(4, true) !== bytes.byteLength - 8) return null;
  const format = tag(12);

  if (format === "VP8X") {
    // Canvas size is stored as three-byte little-endian values, minus one.
    const width = 1 + (bytes[24]! | (bytes[25]! << 8) | (bytes[26]! << 16));
    const height = 1 + (bytes[27]! | (bytes[28]! << 8) | (bytes[29]! << 16));
    return { mimeType: "image/webp", width, height };
  }

  if (format === "VP8 ") {
    if (bytes[23] !== 0x9d || bytes[24] !== 0x01 || bytes[25] !== 0x2a) return null;
    return {
      mimeType: "image/webp",
      width: data.getUint16(26, true) & 0x3fff,
      height: data.getUint16(28, true) & 0x3fff,
    };
  }

  if (format === "VP8L") {
    if (bytes[20] !== 0x2f) return null;
    // 14 bits of width then 14 bits of height, each minus one, little-endian.
    const packed = data.getUint32(21, true);
    return {
      mimeType: "image/webp",
      width: 1 + (packed & 0x3fff),
      height: 1 + ((packed >> 14) & 0x3fff),
    };
  }

  return null;
}
