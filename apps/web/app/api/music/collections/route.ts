import {
  boundedText,
  musicBody,
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
    const { db, userId } = await musicIdentity();
    const trackId = new URL(request.url).searchParams.get("track");
    if (trackId && !UUID.test(trackId))
      throw new MusicError(400, "Invalid track.");
    const { data, error } = await db.rpc("music_playlist_summaries", {
      p_user_id: userId!,
    });
    if (error) throw error;
    const ids = (data ?? []).map((p) => p.id);
    const members =
      trackId && ids.length
        ? await db
            .from("music_playlist_items")
            .select("playlist_id")
            .in("playlist_id", ids)
            .eq("track_id", trackId)
        : { data: [], error: null };
    if (members.error) throw members.error;
    return musicResponse({
      playlists: (data ?? []).map((p) => ({
        id: p.id,
        title: p.title,
        trackCount: p.track_count,
        contains: members.data?.some((m) => m.playlist_id === p.id) ?? false,
      })),
    });
  } catch (error) {
    return musicError(error);
  }
}
export async function POST(request: Request) {
  try {
    await musicRate(request);
    const body = await musicBody(request);
    const { db, userId } = await musicIdentity();
    const action = body.action;
    if ((action === "favourite" && body.value === true) || action === "add") {
      if (typeof body.trackId !== "string" || !UUID.test(body.trackId))
        throw new MusicError(400, "Invalid track.");
      const track = await db
        .from("tracks")
        .select("id")
        .eq("id", body.trackId)
        .eq("status", "live")
        .maybeSingle();
      if (track.error) throw track.error;
      if (!track.data) throw new MusicError(404, "Track not found.");
    }
    if (action === "create") {
      const title = boundedText(body.title, 80, true);
      const { data, error } = await db
        .from("music_playlists")
        .insert({ owner_id: userId!, title })
        .select("id,title")
        .single();
      if (error?.code === "23514")
        throw new MusicError(409, "You can create up to 200 music playlists.");
      if (error) throw error;
      return musicResponse({ playlist: data });
    }
    if (action === "favourite") {
      if (
        typeof body.trackId !== "string" ||
        !UUID.test(body.trackId) ||
        typeof body.value !== "boolean"
      )
        throw new MusicError(400, "Invalid favourite.");
      const result = body.value
        ? await db
            .from("track_favourites")
            .upsert(
              { user_id: userId!, track_id: body.trackId },
              { onConflict: "user_id,track_id", ignoreDuplicates: true },
            )
        : await db
            .from("track_favourites")
            .delete()
            .eq("user_id", userId!)
            .eq("track_id", body.trackId);
      if (result.error) throw result.error;
      return musicResponse({ ok: true });
    }
    if (typeof body.playlistId !== "string" || !UUID.test(body.playlistId))
      throw new MusicError(400, "Invalid playlist.");
    const playlist = await db
      .from("music_playlists")
      .select("id")
      .eq("id", body.playlistId)
      .eq("owner_id", userId!)
      .maybeSingle();
    if (playlist.error) throw playlist.error;
    if (!playlist.data) throw new MusicError(404, "Playlist not found.");
    if (action === "rename" || action === "delete") {
      const result =
        action === "delete"
          ? await db
              .from("music_playlists")
              .delete()
              .eq("id", body.playlistId)
              .eq("owner_id", userId!)
          : await db
              .from("music_playlists")
              .update({ title: boundedText(body.title, 80, true) })
              .eq("id", body.playlistId)
              .eq("owner_id", userId!);
      if (result.error) throw result.error;
      return musicResponse({ ok: true });
    }
    if (
      (action !== "add" && action !== "remove") ||
      typeof body.trackId !== "string" ||
      !UUID.test(body.trackId)
    )
      throw new MusicError(400, "Invalid track.");
    const result =
      action === "add"
        ? await db
            .from("music_playlist_items")
            .upsert(
              { playlist_id: body.playlistId, track_id: body.trackId },
              { onConflict: "playlist_id,track_id", ignoreDuplicates: true },
            )
        : await db
            .from("music_playlist_items")
            .delete()
            .eq("playlist_id", body.playlistId)
            .eq("track_id", body.trackId);
    if (result.error?.code === "23514")
      throw new MusicError(409, "A playlist can contain up to 1000 tracks.");
    if (result.error) throw result.error;
    return musicResponse({ ok: true });
  } catch (error) {
    return musicError(error);
  }
}
