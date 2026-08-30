import type { Database } from "@/lib/supabase/database.types";
import type { Artist, Visualisation } from "@/lib/types";

type Row = Database["public"]["Tables"]["visualisations"]["Row"];
type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];

/**
 * What to call someone, everywhere their name appears.
 *
 * The claimed username wins. `display_name` is whatever the OAuth provider
 * handed over at signup — usually a legal name — while the username is the one
 * the artist chose to be known by here (E5.3). Preferring display_name was
 * signing work with real names that nobody had asked to publish.
 *
 * Kept in one place because it had drifted: the account menu read it this way
 * round and every other surface read it the other, so the V panel disagreed
 * with the player about who made what.
 */
export function artistName(
  profile: { username: string | null; display_name: string | null } | null,
  fallback = "Unknown artist",
): string {
  return profile?.username ?? profile?.display_name ?? fallback;
}

/** A profile row as the panels want to see it. */
export function artistFromProfile(profile: ProfileRow | null): Artist {
  return {
    username: profile?.username ?? "unknown",
    displayName: artistName(profile),
    avatarUrl: profile?.avatar_url ?? undefined,
    bio: profile?.bio ?? undefined,
    visCount: profile?.vis_count ?? 0,
    totalViews: profile?.total_views ?? 0,
  };
}

/** Maps a database row onto the shape the player and panels already speak. */
export function visualisationFromRow(row: Row, artist: Artist): Visualisation {
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? undefined,
    source: row.source,
    artist,
    ownerId: row.owner_id,
    forkedFromId: row.forked_from_id ?? undefined,
    thumbUrl: row.thumb_url ?? undefined,
    usesAudio: row.uses_audio,
    likeCount: row.like_count,
    commentCount: row.comment_count,
    forkCount: row.fork_count,
    viewCount: row.view_count,
    visibility: row.visibility,
    updatedAt: row.updated_at,
  };
}
