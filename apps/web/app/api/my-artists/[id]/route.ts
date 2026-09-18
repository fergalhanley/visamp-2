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

async function ownedArtist(id: string) {
  if (!UUID.test(id)) throw new MusicError(404, "Artist not found.");
  const { db, userId } = await musicIdentity();
  const { data, error } = await db
    .from("music_artists")
    .select("id")
    .eq("id", id)
    .eq("claimed_by", userId!)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new MusicError(404, "Artist not found.");
  return { db, userId: userId! };
}
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { db } = await ownedArtist(id);
    const offset = Number(new URL(request.url).searchParams.get("offset") ?? 0);
    if (!Number.isSafeInteger(offset) || offset < 0)
      throw new MusicError(400, "Invalid page.");
    const { data, error } = await db
      .from("tracks")
      .select("id,title,album,status")
      .eq("music_artist_id", id)
      .order("created_at", { ascending: false })
      .order("id")
      .range(offset, offset + 40);
    if (error) throw error;
    return musicResponse({
      tracks: (data ?? [])
        .slice(0, 40)
        .map((t) => ({ ...t, artworkUrl: `/api/artwork/track/${t.id}` })),
      nextOffset: data && data.length > 40 ? offset + 40 : null,
    });
  } catch (error) {
    return musicError(error);
  }
}
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const body = await musicBody(request);
    const { id } = await params;
    const { db, userId } = await ownedArtist(id);
    const name = boundedText(body.name, 120, true).replace(/\s+/g, " ");
    const bio = boundedText(body.bio, 2000);
    const website = boundedText(body.websiteUrl, 500);
    if (website) {
      try {
        if (!["http:", "https:"].includes(new URL(website).protocol))
          throw new Error();
      } catch {
        throw new MusicError(
          400,
          "Enter a full http or https website address.",
        );
      }
    }
    const { error } = await db
      .from("music_artists")
      .update({ name, bio: bio || null, website_url: website || null })
      .eq("id", id)
      .eq("claimed_by", userId);
    if (error?.code === "23505")
      throw new MusicError(
        409,
        "That artist name is already claimed. Choose another name.",
      );
    if (error) throw error;
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
    const { db, userId } = await ownedArtist(id);
    const key = await uploadArtwork(request, `artist-artwork/${id}`);
    const { data, error } = await db
      .from("music_artists")
      .update({ avatar_key: key })
      .eq("id", id)
      .eq("claimed_by", userId)
      .select("id")
      .maybeSingle();
    if (error || !data) {
      await deleteR2Object("media-visamp-io", key);
      throw error ?? new MusicError(404, "Artist not found.");
    }
    return musicResponse({ ok: true });
  } catch (error) {
    return musicError(error);
  }
}
