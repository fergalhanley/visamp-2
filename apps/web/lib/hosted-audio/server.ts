import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

import { signMediaObject } from "./r2";
import type {
  HostedAudioFormat,
  HostedPlayback,
  HostedTrackSummary,
} from "./types";

export class HostedAudioHttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly detail?: Record<string, unknown>,
  ) {
    super(message);
  }
}

interface ArtistRow {
  id: string;
  slug: string;
  name: string;
  avatar_key: string | null;
}

interface LicenceRow {
  id: string;
  music_artist_id: string;
  status: "pending" | "active" | "terminated";
  signed_at: string | null;
  effective_from: string | null;
  effective_until: string | null;
  grants_hosting: boolean;
  grants_streaming: boolean;
  grants_transcoding: boolean;
  grants_sync: boolean;
}

interface TrackRow {
  id: string;
  slug: string;
  music_artist_id: string;
  licence_id: string | null;
  status: "ingesting" | "draft" | "live" | "withdrawn";
  title: string;
  album: string | null;
  year: number | null;
  bpm: number | string | null;
  musical_key: string | null;
  genre_tags: string[];
  is_explicit: boolean;
  duration_ms: number;
  peaks_key: string | null;
  artwork_1024_key: string | null;
  play_count: number | string;
}

interface RenditionRow {
  format: HostedAudioFormat;
  object_key: string;
  bitrate_kbps: number;
}

function isLicencePlayable(
  licence: LicenceRow | null,
  artistId: string,
): boolean {
  if (
    !licence ||
    licence.music_artist_id !== artistId ||
    licence.status !== "active"
  ) {
    return false;
  }
  if (!licence.signed_at || !licence.effective_from) return false;

  const today = new Date().toISOString().slice(0, 10);
  return (
    licence.effective_from <= today &&
    (!licence.effective_until || licence.effective_until >= today) &&
    licence.grants_hosting &&
    licence.grants_streaming &&
    licence.grants_transcoding &&
    licence.grants_sync
  );
}

function summary(track: TrackRow, artist: ArtistRow): HostedTrackSummary {
  return {
    id: track.id,
    slug: track.slug,
    title: track.title,
    artist: artist.name,
    artistSlug: artist.slug,
    album: track.album,
    year: track.year,
    durationMs: track.duration_ms,
    bpm: track.bpm === null ? null : Number(track.bpm),
    musicalKey: track.musical_key,
    genreTags: track.genre_tags,
    isExplicit: track.is_explicit,
    playCount: Number(track.play_count),
  };
}

async function fetchArtist(id: string): Promise<ArtistRow | null> {
  const { data, error } = await createAdminClient()
    .from("music_artists")
    .select("id, slug, name, avatar_key")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`Could not read hosted artist: ${error.message}`);
  return data as ArtistRow | null;
}

async function fetchLicence(id: string | null): Promise<LicenceRow | null> {
  if (!id) return null;
  const { data, error } = await createAdminClient()
    .from("licences")
    .select(
      "id, music_artist_id, status, signed_at, effective_from, effective_until, grants_hosting, grants_streaming, grants_transcoding, grants_sync",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`Could not read hosted licence: ${error.message}`);
  return data as LicenceRow | null;
}

async function fetchTrack(id: string): Promise<TrackRow | null> {
  const { data, error } = await createAdminClient()
    .from("tracks")
    .select(
      "id, slug, music_artist_id, licence_id, status, title, album, year, bpm, musical_key, genre_tags, is_explicit, duration_ms, peaks_key, artwork_1024_key, play_count",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`Could not read hosted track: ${error.message}`);
  return data as TrackRow | null;
}

async function playbackForTrack(
  track: TrackRow,
  allowDraft: boolean,
): Promise<HostedPlayback> {
  const [artist, licence] = await Promise.all([
    fetchArtist(track.music_artist_id),
    fetchLicence(track.licence_id),
  ]);
  if (!artist) throw new HostedAudioHttpError(404, "Track not found");

  if (track.status === "withdrawn") {
    throw new HostedAudioHttpError(410, "Track withdrawn", {
      track: { id: track.id, title: track.title, artist: artist.name },
    });
  }
  if (
    !allowDraft &&
    (track.status !== "live" || !isLicencePlayable(licence, artist.id))
  ) {
    throw new HostedAudioHttpError(404, "Track not found");
  }

  const { data, error } = await createAdminClient()
    .from("track_renditions")
    .select("format, object_key, bitrate_kbps")
    .eq("track_id", track.id)
    .eq("is_current", true);
  if (error)
    throw new Error(`Could not read hosted renditions: ${error.message}`);

  const renditions = (data ?? []) as RenditionRow[];
  const opus = renditions.find((item) => item.format === "opus");
  const aac = renditions.find((item) => item.format === "aac");
  if (!opus || !aac || !track.peaks_key) {
    throw new HostedAudioHttpError(503, "Track ingest is incomplete");
  }

  const artworkKey = track.artwork_1024_key ?? artist.avatar_key;
  const [opusAsset, aacAsset, peaks, artwork] = await Promise.all([
    signMediaObject(opus.object_key),
    signMediaObject(aac.object_key),
    signMediaObject(track.peaks_key),
    artworkKey ? signMediaObject(artworkKey) : null,
  ]);

  return {
    track: summary(track, artist),
    sources: [
      { format: "opus", bitrateKbps: opus.bitrate_kbps, ...opusAsset },
      { format: "aac", bitrateKbps: aac.bitrate_kbps, ...aacAsset },
    ],
    peaks,
    artwork: artwork ?? { url: "/VA.svg", expiresAt: null },
  };
}

export async function getHostedPlayback(id: string): Promise<HostedPlayback> {
  const track = await fetchTrack(id);
  if (!track) throw new HostedAudioHttpError(404, "Track not found");
  return playbackForTrack(track, false);
}

export async function getAdminHostedPlayback(
  id: string,
): Promise<HostedPlayback> {
  const track = await fetchTrack(id);
  if (!track) throw new HostedAudioHttpError(404, "Track not found");
  return playbackForTrack(track, true);
}

export async function listHostedTracks(
  artistSlug?: string,
): Promise<HostedTrackSummary[]> {
  const admin = createAdminClient();
  let query = admin
    .from("tracks")
    .select(
      "id, slug, music_artist_id, licence_id, status, title, album, year, bpm, musical_key, genre_tags, is_explicit, duration_ms, peaks_key, artwork_1024_key, play_count, music_artists!inner(id, slug, name, avatar_key), licences!inner(id, music_artist_id, status, signed_at, effective_from, effective_until, grants_hosting, grants_streaming, grants_transcoding, grants_sync)",
    )
    .eq("status", "live")
    .order("published_at", { ascending: false })
    .limit(500);
  if (artistSlug) query = query.eq("music_artists.slug", artistSlug);

  const { data, error } = await query;
  if (error) throw new Error(`Could not list hosted tracks: ${error.message}`);

  const candidates = (data ?? []) as unknown as (TrackRow & {
    music_artists: ArtistRow;
    licences: LicenceRow;
  })[];
  const results = candidates.map((track) => {
    if (!isLicencePlayable(track.licences, track.music_artists.id)) return null;
    return summary(track, track.music_artists);
  });

  return results.filter((track): track is HostedTrackSummary => track !== null);
}
