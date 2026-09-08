export type HostedAudioFormat = "opus" | "aac";

export interface HostedTrackSummary {
  id: string;
  slug: string;
  title: string;
  artist: string;
  artistSlug: string;
  album: string | null;
  year: number | null;
  durationMs: number;
  bpm: number | null;
  musicalKey: string | null;
  genreTags: string[];
  isExplicit: boolean;
  playCount: number;
}

export interface HostedSignedAsset {
  url: string;
  expiresAt: string | null;
}

export interface HostedPlaybackSource extends HostedSignedAsset {
  format: HostedAudioFormat;
  bitrateKbps: number;
  expiresAt: string;
}

export interface HostedPlayback {
  track: HostedTrackSummary;
  sources: HostedPlaybackSource[];
  peaks: HostedSignedAsset;
  artwork: HostedSignedAsset;
}
