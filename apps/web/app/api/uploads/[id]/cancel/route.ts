import {
  sameOrigin,
  uploadError,
  uploadIdentity,
} from "@/lib/hosted-audio/uploads";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    sameOrigin(request);
    const { db, userId } = await uploadIdentity();
    const { id } = await params;
    const result = await db
      .from("audio_uploads")
      .update({
        status: "failed",
        error: "File transfer did not finish. Please upload again.",
        finished_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("user_id", userId)
      .eq("status", "uploading")
      .select("id")
      .maybeSingle();
    if (result.error) throw result.error;
    if (!result.data)
      return Response.json(
        { error: "No cancellable upload found." },
        { status: 404 },
      );
    // Its signed PUT may still be valid. The incoming/ lifecycle cleans up any
    // partial file or late retry; the permanent master is never touched here.
    return Response.json({ status: "failed" });
  } catch (error) {
    return uploadError(error);
  }
}
