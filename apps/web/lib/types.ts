export interface Artist {
  username: string;
  displayName: string;
  avatarUrl?: string;
  visCount: number;
  totalViews: number;
}

export interface Visualisation {
  id: string;
  title: string;
  description?: string;
  /** DSL source handed straight to the engine. */
  source: string;
  artist: Artist;
  /** Present for database-backed rows; absent for the local fixtures. */
  ownerId?: string;
  thumbUrl?: string;
  /** Always false until the DSL grows audio bindings. */
  usesAudio: boolean;
  likeCount: number;
  commentCount: number;
  forkCount: number;
  viewCount: number;
  /**
   * Only meaningful for work the viewer owns — browse lists are public-only, so
   * everything in them is implicitly public.
   */
  visibility?: "public" | "unlisted" | "private";
}

/**
 * What advances the visualisation (dev/stories.md E3.2).
 * - `track-audio`  next/prev change the track *and* the visualisation
 * - `time-interval` the visualisation advances on a timer
 * - `manual`       the visualisation only changes when picked
 */
export type PlayerMode = "track-audio" | "time-interval" | "manual";

export const INTERVAL_CHOICES = [10, 20, 30, 60, 120, 300, 600] as const;

/** Where the analyser gets its signal (E4). */
export type AudioSourceKind = "silent" | "mic" | "files" | "soundcloud";

export type TrackSource = "file" | "soundcloud";

export interface Track {
  id: string;
  name: string;
  source: TrackSource;
  /** Local files only. Absent once a File System Access handle goes stale. */
  file?: File;
  /** SoundCloud tracks only — the stream URL is fetched on demand. */
  soundcloudId?: number;
  artist?: string;
  durationMs?: number;
}

export interface SoundCloudPlaylistInfo {
  title: string;
  permalinkUrl: string | null;
  /** Tracks SoundCloud will not stream to this app, hidden from the list. */
  unplayable: number;
}
