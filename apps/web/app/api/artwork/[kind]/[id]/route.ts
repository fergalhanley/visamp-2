import {
  musicRate,
  musicError,
  musicIdentity,
  MusicError,
  UUID,
} from "@/lib/music/api";
import { getHostedArtwork } from "@/lib/hosted-audio/server";
import { signMediaObject } from "@/lib/hosted-audio/r2";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ kind: string; id: string }> },
) {
  try {
    await musicRate(request, true);
    const { kind, id } = await params;
    if (!UUID.test(id) || !["artist", "track"].includes(kind))
      throw new MusicError(404, "Artwork not found.");
    const { db, userId } = await musicIdentity(false);
    let url = "/VA.svg";
    if (kind === "artist") {
      const { data, error } = await db
        .from("music_artists")
        .select("avatar_key")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      if (data?.avatar_key) url = (await signMediaObject(data.avatar_key)).url;
    } else {
      const { data, error } = await db
        .from("tracks")
        .select("artwork_1024_key,music_artists!inner(avatar_key,claimed_by)")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new MusicError(404, "Artwork not found.");
      if (userId && data.music_artists.claimed_by === userId) {
        const key = data.artwork_1024_key ?? data.music_artists.avatar_key;
        if (key) url = (await signMediaObject(key)).url;
      } else {
        url = await getHostedArtwork(id);
      }
    }
    return new Response(null, {
      status: 302,
      headers: { Location: url, "Cache-Control": "private, max-age=60" },
    });
  } catch (error) {
    return musicError(error);
  }
}
