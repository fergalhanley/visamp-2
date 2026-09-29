import {
  boundedText,
  musicBody,
  musicError,
  musicIdentity,
  musicResponse,
  MusicError,
  UUID,
} from "@/lib/music/api";
import { canonicalVideo, videoCatalogue } from "@/lib/videos/catalogue";
import { parseVideo } from "@/lib/videos/timeline";
import type { Database } from "@/lib/supabase/database.types";

type Context = { params: Promise<{ id: string }> };
function document(row: Database["public"]["Tables"]["videos"]["Row"]) {
  return {
    id: row.id,
    title: row.title,
    content: parseVideo(row.content),
    status: row.status,
    updatedAt: row.updated_at,
    distributionState: row.distribution_state,
    scheduleState: row.schedule_state,
  };
}

export async function GET(_request: Request, context: Context) {
  try {
    const { db, userId } = await musicIdentity();
    const { id } = await context.params;
    if (!UUID.test(id)) throw new MusicError(404, "Video not found.");
    const { data, error } = await db
      .from("videos")
      .select("*")
      .eq("id", id)
      .eq("owner_id", userId!)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new MusicError(404, "Video not found.");
    return musicResponse({ video: document(data) });
  } catch (error) {
    return musicError(error);
  }
}

export async function PUT(request: Request, context: Context) {
  try {
    const { db, userId } = await musicIdentity();
    const { id } = await context.params;
    if (!UUID.test(id)) throw new MusicError(404, "Video not found.");
    const input = await musicBody(request, 2097152);
    const title = boundedText(input.title, 160, true);
    if (
      typeof input.updatedAt !== "string" ||
      !Number.isFinite(Date.parse(input.updatedAt))
    )
      throw new MusicError(400, "Missing save version.");
    let content;
    try {
      content = parseVideo(input.content);
    } catch (error) {
      throw new MusicError(
        400,
        error instanceof Error ? error.message : "Invalid video.",
      );
    }
    content = canonicalVideo(
      content,
      await videoCatalogue(db, userId!, content),
    );
    const { data, error } = await db
      .from("videos")
      .update({ title, content })
      .eq("id", id)
      .eq("owner_id", userId!)
      .eq("updated_at", input.updatedAt)
      .select("*")
      .maybeSingle();
    if (error) throw error;
    if (!data)
      throw new MusicError(
        409,
        "This video changed in another window or is unavailable. Your edits are retained; reopen to compare before saving.",
      );
    return musicResponse({ video: document(data) });
  } catch (error) {
    return musicError(error);
  }
}
