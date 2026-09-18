import { serverEvent } from "@/lib/analytics/server";
import { processHostedAudioDeletions } from "@/lib/hosted-audio/deletions";
import {
  boundedText,
  musicBody,
  musicError,
  musicIdentity,
  musicResponse,
  MusicError,
  UUID,
} from "@/lib/music/api";
import { uploadArtwork } from "@/lib/music/artwork";
import { deleteR2Object } from "@/lib/hosted-audio/r2";
async function ownedTrack(id: string) {
  if (!UUID.test(id)) throw new MusicError(404, "Track not found.");
  const { db, userId } = await musicIdentity();
  const track = await db
    .from("tracks")
    .select("id,music_artist_id")
    .eq("id", id)
    .in("status", ["draft", "live"])
    .maybeSingle();
  if (track.error) throw track.error;
  if (!track.data) throw new MusicError(404, "Editable track not found.");
  const artist = await db
    .from("music_artists")
    .select("id")
    .eq("id", track.data.music_artist_id)
    .eq("claimed_by", userId!)
    .maybeSingle();
  if (artist.error) throw artist.error;
  if (!artist.data) throw new MusicError(404, "Editable track not found.");
  return { db, artistId: artist.data.id };
}
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const body = await musicBody(request);
    const { id } = await params;
    const { db, artistId } = await ownedTrack(id);
    const { data, error } = await db
      .from("tracks")
      .update({
        title: boundedText(body.title, 200, true),
        album: boundedText(body.album, 200) || null,
      })
      .eq("id", id)
      .eq("music_artist_id", artistId)
      .in("status", ["draft", "live"])
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new MusicError(404, "Editable track not found.");
    return musicResponse({ ok: true });
  } catch (error) {
    return musicError(error);
  }
}
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { db, artistId } = await ownedTrack(id);
    const key = await uploadArtwork(request, `track-artwork/${id}`);
    const { data, error } = await db
      .from("tracks")
      .update({ artwork_1024_key: key })
      .eq("id", id)
      .eq("music_artist_id", artistId)
      .in("status", ["draft", "live"])
      .select("id")
      .maybeSingle();
    if (error || !data) {
      await deleteR2Object("media-visamp-io", key);
      throw error ?? new MusicError(404, "Editable track not found.");
    }
    return musicResponse({ ok: true });
  } catch (error) {
    return musicError(error);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await musicBody(request);
    const { id } = await params;
    if (!UUID.test(id)) throw new MusicError(404, "Track not found.");
    const { db, userId } = await musicIdentity();
    const { error } = await db.rpc("withdraw_owned_track", {
      p_track_id: id,
      p_user_id: userId!,
    });
    if (error?.code === "42501") throw new MusicError(404, "Track not found.");
    if (error) throw error;
    await serverEvent(request, userId!, "track_removed", { track_id: id }, `track-removed:${id}`);
    // Withdrawal is committed. Failed physical deletes remain in the retryable outbox.
    await processHostedAudioDeletions({ trackId: id }).catch((error) =>
      console.error("[track-removal]", error),
    );
    return musicResponse({ removed: true });
  } catch (error) {
    return musicError(error);
  }
}
