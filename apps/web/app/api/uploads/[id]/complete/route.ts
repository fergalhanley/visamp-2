import { prepareMp3Upload } from "@/lib/hosted-audio/r2";
import { InvalidAudioError } from "@/lib/hosted-audio/inspect-mp3";
import {
  sameOrigin,
  uploadError,
  uploadIdentity,
  uploadLicenceValid,
} from "@/lib/hosted-audio/uploads";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    sameOrigin(request);
    const { db, userId } = await uploadIdentity();
    const { id } = await params;
    const job = await db
      .from("audio_uploads")
      .select("*")
      .eq("id", id)
      .eq("user_id", userId)
      .maybeSingle();
    if (job.error) throw job.error;
    if (!job.data)
      return Response.json({ error: "Upload not found." }, { status: 404 });
    const completed = async (trackId: string | null) => {
      const track = await db
        .from("tracks")
        .select("status")
        .eq("id", trackId ?? "")
        .single();
      if (track.error) throw track.error;
      return Response.json({
        status: "completed",
        trackId,
        trackStatus: track.data.status,
      });
    };
    if (job.data.status === "completed") return completed(job.data.track_id);
    if (job.data.status !== "uploading")
      return Response.json(
        {
          error: job.data.error ?? "Upload is no longer active.",
          retryUpload: true,
        },
        { status: 409 },
      );
    const [artist, licence] = await Promise.all([
      db
        .from("music_artists")
        .select("claimed_by")
        .eq("id", job.data.music_artist_id)
        .maybeSingle(),
      db
        .from("licences")
        .select("*")
        .eq("id", job.data.licence_id)
        .maybeSingle(),
    ]);
    if (artist.error || licence.error)
      throw new Error("Access verification failed.");
    if (
      artist.data?.claimed_by !== userId ||
      !licence.data ||
      !uploadLicenceValid(licence.data)
    )
      return Response.json(
        { error: "Artist access or upload agreement is no longer valid." },
        { status: 403 },
      );
    if (
      Date.now() - Date.parse(job.data.started_at ?? job.data.created_at) >
      3600_000
    )
      return Response.json(
        { error: "Upload expired. Please retry.", retryUpload: true },
        { status: 409 },
      );

    let prepared;
    try {
      prepared = await prepareMp3Upload(job.data);
    } catch (error) {
      if (!(error instanceof InvalidAudioError)) throw error;
      await db
        .from("audio_uploads")
        .update({
          status: "failed",
          error: error.message,
          finished_at: new Date().toISOString(),
        })
        .eq("id", id)
        .eq("status", "uploading");
      return Response.json(
        { error: error.message, retryUpload: true },
        { status: 422 },
      );
    }
    const result = await db.rpc("finalize_mp3_upload", {
      p_upload_id: id,
      p_user_id: userId,
      p_master_key: prepared.masterKey,
      p_media_key: prepared.mediaKey,
      p_sha256: prepared.sha256,
      p_duration_ms: prepared.durationMs,
      p_bitrate_kbps: prepared.bitrateKbps,
      p_album: prepared.album,
      p_year: prepared.year,
    });
    // Keep candidate objects on ambiguous DB failure: the transaction may have
    // committed even if its response was lost. Orphan cleanup handles losers.
    if (result.error) {
      if (["23514", "42501", "23505"].includes(result.error.code)) {
        const message =
          result.error.code === "23505"
            ? "This recording has already been uploaded."
            : result.error.message;
        await db
          .from("audio_uploads")
          .update({
            status: "failed",
            error: message,
            finished_at: new Date().toISOString(),
          })
          .eq("id", id)
          .eq("status", "uploading");
        return Response.json(
          { error: message, retryUpload: true },
          { status: 409 },
        );
      }
      throw result.error;
    }
    return completed(result.data);
  } catch (error) {
    return uploadError(error);
  }
}
