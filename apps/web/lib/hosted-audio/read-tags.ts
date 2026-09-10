/**
 * What we can learn about a lossless file without uploading it.
 *
 * Uploads are `wav`, `flac`, `aif` and `aiff`, so ID3 barely enters into it and
 * each format needs its own reader. Duration comes out reliably for all three;
 * tags are often absent, especially in WAV, so the title falls back to the file
 * name — which is what most people would have typed anyway.
 *
 * Only the head of the file is read. A 250 MB master must not be pulled into
 * memory to find out how long it is.
 */

export interface TrackTags {
  title: string | null;
  artist: string | null;
  album: string | null;
  year: number | null;
  durationMs: number | null;
  sampleRate: number | null;
  channels: number | null;
}

const EMPTY: TrackTags = {
  title: null,
  artist: null,
  album: null,
  year: null,
  durationMs: null,
  sampleRate: null,
  channels: null,
};

/** Enough for a FLAC comment block or a WAV/AIFF header with room to spare. */
const HEAD_BYTES = 512 * 1024;

const ascii = (view: DataView, at: number, length: number) => {
  let out = "";
  for (let i = 0; i < length; i += 1) out += String.fromCharCode(view.getUint8(at + i));
  return out;
};

const clean = (value: string): string | null => {
  const trimmed = value.replace(/\0+$/, "").trim();
  return trimmed ? trimmed : null;
};

const yearOf = (value: string | null): number | null => {
  const match = value?.match(/\d{4}/);
  const year = match ? Number(match[0]) : NaN;
  return Number.isInteger(year) && year > 1800 && year < 2200 ? year : null;
};

/**
 * AIFF stores its sample rate as an 80-bit IEEE extended float, which nothing
 * else uses and JavaScript cannot read directly.
 */
function extendedFloat(view: DataView, at: number): number {
  const exponent = view.getUint16(at);
  const hi = view.getUint32(at + 2);
  const lo = view.getUint32(at + 6);
  const sign = exponent & 0x8000 ? -1 : 1;
  const power = (exponent & 0x7fff) - 16383 - 63;
  return sign * (hi * 2 ** 32 + lo) * 2 ** power;
}

function readWav(view: DataView): TrackTags {
  const tags = { ...EMPTY };
  let byteRate = 0;
  let at = 12;

  while (at + 8 <= view.byteLength) {
    const id = ascii(view, at, 4);
    const size = view.getUint32(at + 4, true);
    const body = at + 8;

    if (id === "fmt " && body + 16 <= view.byteLength) {
      tags.channels = view.getUint16(body + 2, true);
      tags.sampleRate = view.getUint32(body + 4, true);
      byteRate = view.getUint32(body + 8, true);
    } else if (id === "data" && byteRate > 0) {
      tags.durationMs = Math.round((size / byteRate) * 1000);
    } else if (id === "LIST" && ascii(view, body, 4) === "INFO") {
      // Optional, and frequently missing — most DAWs write no INFO chunk.
      let cursor = body + 4;
      const end = Math.min(body + size, view.byteLength);
      while (cursor + 8 <= end) {
        const key = ascii(view, cursor, 4);
        const length = view.getUint32(cursor + 4, true);
        const text = clean(ascii(view, cursor + 8, Math.min(length, end - cursor - 8)));
        if (key === "INAM") tags.title = text;
        else if (key === "IART") tags.artist = text;
        else if (key === "IPRD") tags.album = text;
        else if (key === "ICRD") tags.year = yearOf(text);
        cursor += 8 + length + (length % 2);
      }
    }

    at = body + size + (size % 2);
  }

  return tags;
}

function readFlac(view: DataView): TrackTags {
  const tags = { ...EMPTY };
  let at = 4;

  while (at + 4 <= view.byteLength) {
    const header = view.getUint8(at);
    const last = (header & 0x80) !== 0;
    const type = header & 0x7f;
    const size = (view.getUint8(at + 1) << 16) | (view.getUint8(at + 2) << 8) | view.getUint8(at + 3);
    const body = at + 4;
    if (body + size > view.byteLength) break;

    if (type === 0 && size >= 18) {
      // STREAMINFO packs sample rate, channels and total samples across bit
      // boundaries, so this reads bytes 10-17 as one 64-bit field.
      const hi = view.getUint32(body + 10);
      const lo = view.getUint32(body + 14);
      tags.sampleRate = hi >>> 12;
      tags.channels = ((hi >>> 9) & 0x7) + 1;
      const totalSamples = (hi & 0xf) * 2 ** 32 + lo;
      if (tags.sampleRate > 0 && totalSamples > 0)
        tags.durationMs = Math.round((totalSamples / tags.sampleRate) * 1000);
    } else if (type === 4) {
      // VORBIS_COMMENT: a vendor string then NAME=value entries, all
      // little-endian and UTF-8.
      const bytes = new Uint8Array(view.buffer, view.byteOffset + body, size);
      const text = new TextDecoder();
      let cursor = 0;
      const u32 = () => {
        const value =
          bytes[cursor]! | (bytes[cursor + 1]! << 8) | (bytes[cursor + 2]! << 16) | (bytes[cursor + 3]! << 24);
        cursor += 4;
        return value >>> 0;
      };
      // Read the length first: `cursor += u32()` would use the cursor value
      // from before u32 advanced it, and silently land 4 bytes short.
      const vendorLength = u32();
      cursor += vendorLength;
      const count = u32();
      for (let i = 0; i < count && cursor < bytes.length; i += 1) {
        const length = u32();
        const entry = text.decode(bytes.subarray(cursor, cursor + length));
        cursor += length;
        const split = entry.indexOf("=");
        if (split < 0) continue;
        const key = entry.slice(0, split).toUpperCase();
        const value = clean(entry.slice(split + 1));
        if (key === "TITLE") tags.title = value;
        else if (key === "ARTIST") tags.artist = value;
        else if (key === "ALBUM") tags.album = value;
        else if (key === "DATE" || key === "YEAR") tags.year = yearOf(value);
      }
    }

    if (last) break;
    at = body + size;
  }

  return tags;
}

function readAiff(view: DataView): TrackTags {
  const tags = { ...EMPTY };
  let at = 12;

  while (at + 8 <= view.byteLength) {
    const id = ascii(view, at, 4);
    const size = view.getUint32(at + 4);
    const body = at + 8;
    if (body > view.byteLength) break;

    if (id === "COMM" && body + 18 <= view.byteLength) {
      tags.channels = view.getUint16(body);
      const frames = view.getUint32(body + 2);
      tags.sampleRate = Math.round(extendedFloat(view, body + 8));
      if (tags.sampleRate > 0)
        tags.durationMs = Math.round((frames / tags.sampleRate) * 1000);
    } else if (id === "NAME") {
      tags.title = clean(ascii(view, body, Math.min(size, view.byteLength - body)));
    } else if (id === "AUTH") {
      tags.artist = clean(ascii(view, body, Math.min(size, view.byteLength - body)));
    }

    at = body + size + (size % 2);
  }

  return tags;
}

/** The file name, minus extension and the usual separators, as a last resort. */
export function titleFromFileName(name: string): string {
  const base = name.replace(/\.[^.]+$/, "");
  const stripped = base.replace(/^\s*\d{1,3}[\s._-]+/, "");
  return (stripped || base).replace(/[._]+/g, " ").replace(/\s+/g, " ").trim();
}

export async function readTrackTags(file: File): Promise<TrackTags> {
  try {
    const head = await file.slice(0, Math.min(HEAD_BYTES, file.size)).arrayBuffer();
    const view = new DataView(head);
    if (view.byteLength < 12) return { ...EMPTY };

    const magic = ascii(view, 0, 4);
    if (magic === "RIFF" && ascii(view, 8, 4) === "WAVE") return readWav(view);
    if (magic === "fLaC") return readFlac(view);
    if (magic === "FORM") return readAiff(view);
    return { ...EMPTY };
  } catch {
    // A file we cannot parse still uploads; the title just falls back.
    return { ...EMPTY };
  }
}
