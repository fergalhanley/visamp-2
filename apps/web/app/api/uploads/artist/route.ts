import { serverEvent } from "@/lib/analytics/server";
import {
  sameOrigin,
  uploadError,
  uploadIdentity,
} from "@/lib/hosted-audio/uploads";
import { readableRpcError } from "@/lib/hosted-audio/rpc-errors";

/** Matches the column bound; the RPC re-checks, this only saves a round trip. */
const MAX_NAME = 120;

/** The authenticated server owns claim identity; artist names are unique in SQL. */
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const { db, userId } = await uploadIdentity();

    let name: unknown;
    try {
      ({ name } = (await request.json()) as { name?: unknown });
    } catch {
      return Response.json({ error: "Expected a JSON body" }, { status: 400 });
    }

    if (typeof name !== "string" || !name.trim() || name.trim().length > MAX_NAME)
      return Response.json(
        { error: `Enter an artist name of 1 to ${MAX_NAME} characters.` },
        { status: 400 },
      );

    const { data, error } = await db.rpc("claim_music_artist", {
      p_user_id: userId,
      p_name: name,
    });

    // The function raises with wording meant for the person reading it — an
    // existing claim, a name that yields no usable web address. Passing that
    // through beats a generic failure that leaves them guessing; anything the
    // function did not raise on purpose is infrastructure, and is not theirs
    // to read.
    if (error) {
      if (error.code === "23505" && error.message === "This artist name has already been claimed.") {
        await serverEvent(request, userId, "artist_name_conflict");
        let artist: { name?: unknown; slug?: unknown } | null = null;
        try { artist = JSON.parse(error.details); } catch { /* Do not expose raw database details. */ }
        if (artist && typeof artist.name === "string" && typeof artist.slug === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(artist.slug)) {
          return Response.json({ error: error.message, code: "artist_name_claimed", artist: { name: artist.name, slug: artist.slug } }, { status: 409, headers: { "Cache-Control": "private, no-store" } });
        }
      }
      const readable = readableRpcError(error);
      if (!readable) throw error;
      return Response.json({ error: readable }, { status: 409 });
    }

    await serverEvent(request, userId, "artist_created", { artist_id: data.id }, `artist-created:${data.id}`);
    return Response.json(
      { artist: { id: data.id, name: data.name, slug: data.slug } },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return uploadError(error);
  }
}
