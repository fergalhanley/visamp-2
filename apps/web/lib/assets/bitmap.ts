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

function readPng(bytes: Uint8Array): BitmapInfo | null {
  if (bytes.byteLength < 24) return null;
  if (PNG_SIGNATURE.some((byte, index) => bytes[index] !== byte)) return null;
  // IHDR must be the first chunk, so width and height sit at fixed offsets.
  if (String.fromCharCode(...bytes.subarray(12, 16)) !== "IHDR") return null;
  return {
    mimeType: "image/png",
    width: view(bytes).getUint32(16, false),
    height: view(bytes).getUint32(20, false),
  };
}

function readJpeg(bytes: Uint8Array): BitmapInfo | null {
  if (bytes.byteLength < 4) return null;
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) return null;

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

  const data = view(bytes);
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
