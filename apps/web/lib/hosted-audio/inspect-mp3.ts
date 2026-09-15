import { parseFile } from "music-metadata";

export class InvalidAudioError extends Error {}

/** Read codec and tags only: no decoding, normalization or re-encoding. */
export async function inspectMp3(path: string) {
  const metadata = await parseFile(path, { duration: true, skipCovers: true });
  const { codec, duration, bitrate, numberOfChannels } = metadata.format;
  if (
    !/^MPEG (?:1|2|2\.5) Layer 3$/.test(codec ?? "") ||
    !numberOfChannels ||
    numberOfChannels > 2
  ) {
    throw new InvalidAudioError(
      "Choose an MP3 audio file. Renaming another format does not convert it.",
    );
  }
  if (
    !duration ||
    !Number.isFinite(duration) ||
    duration <= 0 ||
    duration > 1800 ||
    !bitrate ||
    !Number.isFinite(bitrate) ||
    bitrate <= 0
  ) {
    throw new InvalidAudioError("Choose a readable MP3 up to 30 minutes long.");
  }
  return {
    durationMs: Math.round(duration * 1000),
    bitrateKbps: Math.max(1, Math.round(bitrate / 1000)),
    album: metadata.common.album?.slice(0, 200) ?? null,
    year:
      metadata.common.year &&
      metadata.common.year >= 1900 &&
      metadata.common.year <= 2200
        ? metadata.common.year
        : null,
  };
}
