import type { Database } from "@/lib/supabase/database.types";
import { profileAvatarUrl, publicStorageUrl } from "@/lib/storage-urls";
import type { Artist, Visualisation } from "@/lib/types";

type Row = Database["public"]["Tables"]["visualisations"]["Row"];
type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];
/** Public attribution uses only the username a person chose on VisAmp. */
export function artistName(
  profile: { username: string | null } | null,
  fallback = "Unknown artist",
): string {
  return profile?.username ?? fallback;
}

/** A profile row as the panels want to see it. */
export function artistFromProfile(profile: ProfileRow | null): Artist {
  return {
    username: profile?.username ?? "unknown",
    avatarUrl: profileAvatarUrl(profile),
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
    thumbUrl: publicStorageUrl("thumbnails", row.thumb_path, row.updated_at),
    usesAudio: row.uses_audio,
    likeCount: row.like_count,
    commentCount: row.comment_count,
    forkCount: row.fork_count,
    viewCount: row.view_count,
    visibility: row.visibility,
    updatedAt: row.updated_at,
  };
}
