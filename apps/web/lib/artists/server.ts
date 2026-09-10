import "server-only";

import { signMediaObject } from "@/lib/hosted-audio/r2";
import { listHostedTracks } from "@/lib/hosted-audio/server";
import type { HostedTrackSummary } from "@/lib/hosted-audio/types";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/**
 * VIS-6 — an artist is the music act, not the person. It may have no account
 * behind it at all, so nothing here may assume a `profiles` row exists.
 */
export interface ArtistProfile {
  id: string;
  slug: string;
  name: string;
  bio: string | null;
  websiteUrl: string | null;
  avatarUrl: string | null;
  tracks: HostedTrackSummary[];
  /**
   * The claimant's creator profile, only when they have public visualisations
   * worth linking to. Null for an unclaimed artist, and for a claimant whose
   * work is all private.
   */
  creatorUsername: string | null;
  /** Whether anyone but the claimant may see this page. */
  isPublic: boolean;
  /** Whether the viewer is the claimant, and so may see it regardless. */
  viewerIsClaimant: boolean;
}

export interface ArtistCard {
  slug: string;
  name: string;
  avatarUrl: string | null;
  trackCount: number;
  playCount: number;
}

/**
 * `music_artists` and `tracks` are revoked from `anon` and `authenticated`, so
 * every read here goes through the admin client and this module decides what
 * the viewer is allowed to see.
 */
function admin() {
  return createAdminClient();
}

/**
 * Best-effort: an artist with an unsignable avatar still has a page. R2 is
 * configured for hosted audio, and a page should not 500 because it is not.
 */
async function avatarUrl(key: string | null): Promise<string | null> {
  if (!key) return null;
  try {
    return (await signMediaObject(key)).url;
  } catch {
    return null;
  }
}

async function viewerId(): Promise<string | null> {
  const { data } = await (await createClient()).auth.getUser();
  return data.user?.id ?? null;
}

/**
 * VIS-84 — an artist page is public once the artist has something anyone can
 * actually listen to, and before that is visible only to its claimant.
 *
 * Derived rather than stored, so there is no second source of truth to fall out
 * of step with the tracks themselves. "Live" here means what `listHostedTracks`
 * means by it — status `live` *and* a licence that still grants playback — so a
 * page never goes public with nothing playable on it.
 *
 * This is what makes unverified self-serve claiming safe: a claim grants the
 * ability to upload, not a public identity, because the page appears on the
 * same admin licence activation that releases the music.
 */
export async function loadArtist(slug: string): Promise<ArtistProfile | null> {
  const { data: artist, error } = await admin()
    .from("music_artists")
    .select("id, slug, name, bio, website_url, avatar_key, claimed_by")
    .eq("slug", slug)
    .maybeSingle();

  if (error) throw new Error(`Could not read artist: ${error.message}`);
  if (!artist) return null;

  const tracks = await listHostedTracks(artist.slug);
  const isPublic = tracks.length > 0;

  // Returned either way, so the caller can tell "no such artist" from "not
  // yours to see" — the first is somebody's old creator link and redirects,
  // the second is a 404.
  const viewer = isPublic ? null : await viewerId();
  const viewerIsClaimant = Boolean(
    artist.claimed_by && viewer && viewer === artist.claimed_by,
  );

  // Only worth linking when there is something at the other end. A claimant
  // with no public visualisations has a creator profile that would 404.
  let creatorUsername: string | null = null;
  if (artist.claimed_by && isPublic) {
    const { data: profile } = await admin()
      .from("profiles")
      .select("username, vis_count")
      .eq("id", artist.claimed_by)
      .maybeSingle();
    if (profile?.username && profile.vis_count > 0)
      creatorUsername = profile.username;
  }

  return {
    id: artist.id,
    slug: artist.slug,
    name: artist.name,
    bio: artist.bio,
    websiteUrl: artist.website_url,
    avatarUrl: await avatarUrl(artist.avatar_key),
    tracks,
    creatorUsername,
    isPublic,
    viewerIsClaimant,
  };
}

/**
 * Every artist with something playable, busiest first.
 *
 * Built from the tracks rather than from `music_artists`, because "has a live
 * track" is the only thing that makes an artist public and the track list
 * already applies the licence check. Artists with nothing live are absent by
 * construction rather than by a filter that could be forgotten.
 */
export async function listPublicArtists(): Promise<ArtistCard[]> {
  const tracks = await listHostedTracks();
  if (!tracks.length) return [];

  const bySlug = new Map<string, { name: string; trackCount: number; playCount: number }>();
  for (const track of tracks) {
    const row = bySlug.get(track.artistSlug) ?? {
      name: track.artist,
      trackCount: 0,
      playCount: 0,
    };
    row.trackCount += 1;
    row.playCount += track.playCount;
    bySlug.set(track.artistSlug, row);
  }

  const { data, error } = await admin()
    .from("music_artists")
    .select("slug, avatar_key")
    .in("slug", [...bySlug.keys()]);
  if (error) throw new Error(`Could not read artists: ${error.message}`);

  const avatarKeys = new Map(
    (data ?? []).map((row) => [row.slug, row.avatar_key] as const),
  );

  const cards = await Promise.all(
    [...bySlug.entries()].map(async ([slug, row]) => ({
      slug,
      name: row.name,
      avatarUrl: await avatarUrl(avatarKeys.get(slug) ?? null),
      trackCount: row.trackCount,
      playCount: row.playCount,
    })),
  );

  return cards.sort(
    (a, b) => b.playCount - a.playCount || a.name.localeCompare(b.name),
  );
}
