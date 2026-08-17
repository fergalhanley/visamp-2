import type { Database } from "@/lib/supabase/database.types";
import type { Artist, Visualisation } from "@/lib/types";

type Row = Database["public"]["Tables"]["visualisations"]["Row"];
type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];

/** A profile row as the panels want to see it. */
export function artistFromProfile(profile: ProfileRow | null): Artist {
  return {
    username: profile?.username ?? "unknown",
    displayName: profile?.display_name ?? profile?.username ?? "Unknown artist",
    avatarUrl: profile?.avatar_url ?? undefined,
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
    thumbUrl: row.thumb_url ?? undefined,
    usesAudio: row.uses_audio,
    likeCount: row.like_count,
    commentCount: row.comment_count,
    forkCount: row.fork_count,
    viewCount: row.view_count,
    visibility: row.visibility,
  };
}
