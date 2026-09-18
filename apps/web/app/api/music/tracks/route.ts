import {
  musicError,
  musicRate,
  musicIdentity,
  musicResponse,
  MusicError,
  UUID,
} from "@/lib/music/api";

export async function GET(request: Request) {
  try {
    await musicRate(request);
    const params = new URL(request.url).searchParams;
    const { db, userId } = await musicIdentity(false);
    const playlist = params.get("playlist");
    const favourites = params.get("favourites") === "true";
    if ((playlist || favourites) && !userId)
      throw new MusicError(401, "Sign in to see your music library.");
    if (playlist && !UUID.test(playlist))
      throw new MusicError(400, "Invalid playlist.");
    const offset = Number(params.get("offset") ?? 0);
    if (!Number.isSafeInteger(offset) || offset < 0 || offset > 1000000)
      throw new MusicError(400, "Invalid page.");
    if (playlist) {
      const { data, error } = await db
        .from("music_playlists")
        .select("id")
        .eq("id", playlist)
        .eq("owner_id", userId!)
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new MusicError(404, "Playlist not found.");
    }
    const { data, error } = await db.rpc("browse_music", {
      p_query: (params.get("q") ?? "").slice(0, 200),
      ...(params.get("artist") ? { p_artist: params.get("artist")! } : {}),
      ...(userId ? { p_user_id: userId } : {}),
      ...(playlist ? { p_playlist: playlist } : {}),
      p_favourites: favourites,
      p_offset: offset,
      p_limit: 40,
    });
    if (error) throw error;
    return musicResponse(data);
  } catch (error) {
    return musicError(error);
  }
}
