import { inspectMasterUpload } from "@/lib/hosted-audio/r2";
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
    const { db, userId, admin } = await uploadIdentity();
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
    if (job.data.status !== "uploading")
      return Response.json({ status: job.data.status });
    const artist = await db
      .from("music_artists")
      .select("claimed_by")
      .eq("id", job.data.music_artist_id)
      .maybeSingle();
    const licence = await db
      .from("licences")
      .select("*")
      .eq("id", job.data.licence_id)
      .maybeSingle();
    if (artist.error || licence.error)
      throw new Error("Access verification failed.");
    if (
      (!admin && artist.data?.claimed_by !== userId) ||
      !licence.data ||
      !uploadLicenceValid(licence.data)
    )
      return Response.json(
        { error: "Artist access or licence is no longer valid." },
        { status: 403 },
      );
    if (Date.now() - Date.parse(job.data.created_at) > 3600_000)
      return Response.json(
        { error: "Upload expired. Please submit again." },
        { status: 409 },
      );
    const object = await inspectMasterUpload(job.data.object_key);
    if (object.ContentLength !== job.data.bytes)
      return Response.json(
        {
          error:
            "The uploaded file size does not match. Please retry the upload.",
        },
        { status: 409 },
      );
    const result = await db
      .from("audio_uploads")
      .update({ status: "queued" })
      .eq("id", id)
      .eq("status", "uploading");
    if (result.error) throw result.error;
    return Response.json({ status: "queued" });
  } catch (error) {
    return uploadError(error);
  }
}
