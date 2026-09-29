import { getHostedTrackSummary } from "@/lib/hosted-audio/server";
import {
  musicError,
  musicIdentity,
  musicResponse,
} from "@/lib/music/api";

/**
 * Tracks the signed-in musician can use in Studio.
 *
 * Studio only offers live/playable tracks: an upload that is still ingesting
 * has nothing stable to preview or license yet.
 */
export async function GET() {
  try {
    const { db, userId } = await musicIdentity();

    const { data: artists, error: artistsError } = await db
      .from("music_artists")
      .select("id")
      .eq("claimed_by", userId!);
    if (artistsError) throw artistsError;

    const artistIds = (artists ?? []).map((artist) => artist.id);
    if (!artistIds.length) return musicResponse({ tracks: [] });

    const { data: rows, error } = await db
      .from("tracks")
      .select("id")
      .in("music_artist_id", artistIds)
      .eq("status", "live")
      .order("published_at", { ascending: false });
    if (error) throw error;

    const summaries = await Promise.all(
      (rows ?? []).map((track) => getHostedTrackSummary(track.id)),
    );

    return musicResponse({
      tracks: summaries.filter((track) => track !== null),
    });
  } catch (error) {
    return musicError(error);
  }
}
