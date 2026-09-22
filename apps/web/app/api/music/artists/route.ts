import { isLicencePlayable } from "@/lib/hosted-audio/server";
import {
  musicError,
  musicRate,
  musicIdentity,
  musicResponse,
  MusicError,
} from "@/lib/music/api";

export async function GET(request: Request) {
  try {
    await musicRate(request);
    const { db } = await musicIdentity(false);
    const params = new URL(request.url).searchParams;
    const offset = Number(params.get("offset") ?? 0);
    if (!Number.isSafeInteger(offset) || offset < 0 || offset > 1000000)
      throw new MusicError(400, "Invalid page.");
    let query = db
      .from("music_artists")
      .select("id,name,slug")
      .order("name")
      .order("id")
      .range(offset, offset + 40);
    const search = (params.get("q") ?? "").trim().slice(0, 200);
    if (search)
      query = query.ilike("name", `%${search.replace(/[\\%_]/g, "\\$&")}%`);
    const { data, error } = await query;
    if (error) throw error;
    const artists = (data ?? []).slice(0, 40);
    const counts = new Map<string, number>();
    // Page track references so counts are not truncated by the API row limit.
    if (artists.length) {
      for (let start = 0; ; start += 1000) {
        const { data: tracks, error: trackError } = await db
          .from("tracks")
          .select(
            "id,music_artist_id,licences!inner(id,music_artist_id,status,signed_at,effective_from,effective_until,grants_hosting,grants_streaming,grants_transcoding,grants_sync)",
          )
          .in(
            "music_artist_id",
            artists.map((a) => a.id),
          )
          .eq("status", "live")
          .order("id")
          .range(start, start + 999);
        if (trackError) throw trackError;
        for (const track of tracks ?? []) {
          if (isLicencePlayable(track.licences, track.music_artist_id))
            counts.set(
              track.music_artist_id,
              (counts.get(track.music_artist_id) ?? 0) + 1,
            );
        }
        if (!tracks || tracks.length < 1000) break;
      }
    }
    return musicResponse({
      artists: artists.map((a) => ({
        ...a,
        artworkUrl: `/api/artwork/artist/${a.id}`,
        trackCount: counts.get(a.id) ?? 0,
      })),
      nextOffset: data && data.length > 40 ? offset + 40 : null,
    });
  } catch (error) {
    return musicError(error);
  }
}
