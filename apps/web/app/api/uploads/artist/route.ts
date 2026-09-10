import {
  sameOrigin,
  uploadError,
  uploadIdentity,
} from "@/lib/hosted-audio/uploads";
import { readableRpcError } from "@/lib/hosted-audio/rpc-errors";

/** Matches the column bound; the RPC re-checks, this only saves a round trip. */
const MAX_NAME = 120;

/**
 * VIS-83 — create the caller's own artist and claim it, so uploading no longer
 * waits on an admin running SQL.
 *
 * Deliberately unverified. A claim grants an upload capability, not a public
 * identity: the artist's page stays private to its claimant until the artist
 * has a live track, which needs the licence an admin still activates by hand.
 *
 * `music_artists` is revoked from `authenticated`, so the insert goes through
 * `claim_music_artist` as `service_role` — the same shape as `begin_audio_upload`,
 * where the server establishes who the user is and the function does the rest.
 */
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
      const readable = readableRpcError(error);
      if (!readable) throw error;
      return Response.json({ error: readable }, { status: 409 });
    }

    return Response.json(
      { artist: { id: data.id, name: data.name, slug: data.slug } },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return uploadError(error);
  }
}
