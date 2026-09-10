import { randomUUID } from "node:crypto";
import { signMasterUpload } from "@/lib/hosted-audio/r2";
import {
  readUploadDetails,
  sameOrigin,
  uploadError,
  uploadIdentity,
  uploadLicenceGrantsIngest,
} from "@/lib/hosted-audio/uploads";
import { CURRENT_AGREEMENT_VERSION } from "@/lib/hosted-audio/agreement";
import { readableRpcError } from "@/lib/hosted-audio/rpc-errors";

export async function GET() {
  try {
    const { db, userId, admin } = await uploadIdentity();
    let artistsQuery = db
      .from("music_artists")
      .select("id,slug,name")
      .order("name")
      .limit(200);
    if (!admin) artistsQuery = artistsQuery.eq("claimed_by", userId);
    const artists = await artistsQuery;
    if (artists.error) throw artists.error;
    const ids = (artists.data ?? []).map((artist) => artist.id);
    // VIS-86 — there is no licence to choose any more. What the form still
    // wants to know is whether this artist's music has been approved yet, so it
    // can say so rather than leaving people wondering where their track went.
    const licences = ids.length
      ? await db
          .from("licences")
          .select("*")
          .in("music_artist_id", ids)
          .eq("status", "active")
          .limit(500)
      : { data: [], error: null };
    const uploads = await db
      .from("audio_uploads")
      .select("id,title,status,error,created_at,track_id")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(30);
    if (licences.error || uploads.error)
      throw new Error("Upload configuration unavailable.");
    return Response.json(
      {
        artists: artists.data,
        approvedArtistIds: (licences.data ?? [])
          .filter((licence) => licence.status === "active")
          .map((licence) => licence.music_artist_id),
        agreementVersion: CURRENT_AGREEMENT_VERSION,
        uploads: uploads.data,
        admin,
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return uploadError(error);
  }
}

export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const { db, userId, admin } = await uploadIdentity();
    let body;
    try {
      body = await readUploadDetails(request);
    } catch (error) {
      return Response.json(
        {
          error:
            error instanceof RangeError
              ? error.message
              : "Invalid upload details.",
        },
        { status: error instanceof RangeError ? 413 : 400 },
      );
    }
    if (!body || typeof body !== "object" || Array.isArray(body))
      return Response.json(
        { error: "Invalid upload details." },
        { status: 400 },
      );
    const { title, fileName, bytes, sha256, artistId, rightsConfirmed } =
      body as Record<string, unknown>;
    const uuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const extension =
      typeof fileName === "string"
        ? fileName.split(".").at(-1)?.toLowerCase()
        : null;
    const types: Record<string, string> = {
      wav: "audio/wav",
      flac: "audio/flac",
      aif: "audio/aiff",
      aiff: "audio/aiff",
    };
    if (
      typeof title !== "string" ||
      !title.trim() ||
      title.length > 200 ||
      typeof fileName !== "string" ||
      fileName.length > 255 ||
      !extension ||
      !Object.hasOwn(types, extension) ||
      typeof bytes !== "number" ||
      !Number.isSafeInteger(bytes) ||
      bytes < 1 ||
      bytes > 250 * 1024 * 1024 ||
      typeof sha256 !== "string" ||
      !/^[0-9a-f]{64}$/.test(sha256) ||
      typeof artistId !== "string" ||
      !uuid.test(artistId) ||
      rightsConfirmed !== true
    )
      return Response.json(
        {
          error:
            "Choose a lossless file up to 250 MB, enter a title and confirm the rights.",
        },
        { status: 400 },
      );
    const artist = await db
      .from("music_artists")
      .select("id,claimed_by")
      .eq("id", artistId)
      .maybeSingle();
    if (artist.error) throw artist.error;
    if (!artist.data || (!admin && artist.data.claimed_by !== userId))
      return Response.json(
        { error: "This artist is not linked to your account." },
        { status: 403 },
      );
    // `rightsConfirmed` is the checkbox, and this is what it means: accepting
    // the agreement is what creates the licence. Idempotent, so a batch of ten
    // files produces one licence, not ten.
    const accepted = await db.rpc("accept_self_upload_agreement", {
      p_user_id: userId,
      p_artist_id: artistId,
      p_version: CURRENT_AGREEMENT_VERSION,
      p_user_agent: request.headers.get("user-agent") ?? "",
    });
    if (accepted.error) {
      const readable = readableRpcError(accepted.error);
      // Anything else is ours to fix, not theirs to read: rethrow so it is
      // logged and answered generically.
      if (!readable) throw accepted.error;
      return Response.json({ error: readable }, { status: 403 });
    }

    const licence = accepted.data;
    if (!licence || !uploadLicenceGrantsIngest(licence))
      return Response.json(
        { error: "The upload agreement could not be recorded." },
        { status: 403 },
      );
    const licenceId = licence.id;
    const id = randomUUID();
    const key = `incoming/${userId}/${id}/original.${extension}`;
    const admission = await db.rpc("begin_audio_upload", {
      p_id: id,
      p_user_id: userId,
      p_artist_id: artistId,
      p_licence_id: licenceId,
      p_title: title.trim(),
      p_file_name: fileName,
      p_object_key: key,
      p_bytes: bytes,
      p_sha256: sha256,
    });
    if (admission.error) {
      if (admission.error.message.includes("Upload limit reached"))
        return Response.json(
          {
            error:
              "Upload limit reached. Wait for existing uploads to finish (3 pending, 20 per day).",
          },
          { status: 429 },
        );
      throw admission.error;
    }
    const contentType = types[extension]!;
    try {
      const url = await signMasterUpload(key, bytes, contentType);
      return Response.json(
        { id, url, contentType },
        { headers: { "Cache-Control": "private, no-store" } },
      );
    } catch (error) {
      await db
        .from("audio_uploads")
        .update({
          status: "failed",
          error: "Could not start upload.",
          finished_at: new Date().toISOString(),
        })
        .eq("id", id);
      throw error;
    }
  } catch (error) {
    return uploadError(error);
  }
}
