import "server-only";
import { readArtistLinks, type ArtistLink } from "./links";

import { signMediaObject } from "@/lib/hosted-audio/r2";
import { listHostedTracks } from "@/lib/hosted-audio/server";
import type { HostedTrackSummary } from "@/lib/hosted-audio/types";
import { createAdminClient } from "@/lib/supabase/admin";

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
  links: ArtistLink[];
  avatarUrl: string | null;
  tracks: HostedTrackSummary[];
  /**
   * The claimant's creator profile, only when they have public visualisations
   * worth linking to. Null for an unclaimed artist, and for a claimant whose
   * work is all private.
   */
  creatorUsername: string | null;

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

/** Full artist profiles are public immediately, even before music is live. */
export async function loadArtist(slug: string): Promise<ArtistProfile | null> {
  const { data: artist, error } = await admin()
    .from("music_artists")
    .select("id, slug, name, bio, website_url, links, avatar_key, claimed_by")
    .eq("slug", slug)
    .maybeSingle();

  if (error) throw new Error(`Could not read artist: ${error.message}`);
  if (!artist) return null;

  const tracks = await listHostedTracks(artist.slug);
  // Only worth linking when there is something at the other end. A claimant
  // with no public visualisations has a creator profile that would 404.
  let creatorUsername: string | null = null;
  if (artist.claimed_by) {
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
    links: readArtistLinks(artist.links, artist.website_url),
    avatarUrl: await avatarUrl(artist.avatar_key),
    tracks,
    creatorUsername,
  };
}

/**
 * Every artist with something playable, busiest first.
 *
 * Built from the tracks rather than from `music_artists`, because this directory
 * lists playable music and the track list already applies the licence check. Artists with nothing live are absent by
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
