import {
  requireAdmin,
  AdminAuthorizationError,
} from "@/lib/hosted-audio/admin";
import { createAdminClient } from "@/lib/supabase/admin";
export async function GET(request: Request) {
  try {
    await requireAdmin();
    const page = Number(new URL(request.url).searchParams.get("page") ?? 0);
    if (!Number.isSafeInteger(page) || page < 0 || page > 4000)
      return Response.json({ error: "Invalid page." }, { status: 400 });
    const db = createAdminClient();
    const [profiles, visuals, tracks, pending, catalogue, uploads] =
      await Promise.all([
        db.from("profiles").select("id", { count: "exact", head: true }),
        db.from("visualisations").select("id", { count: "exact", head: true }),
        db.from("tracks").select("id", { count: "exact", head: true }),
        db
          .from("audio_uploads")
          .select("id", { count: "exact", head: true })
          .in("status", ["queued", "processing"]),
        db
          .from("tracks")
          .select("id,title,status,play_count,created_at,album,music_artist_id")
          .order("created_at", { ascending: false })
          .order("id")
          .range(page * 25, page * 25 + 24),
        db
          .from("audio_uploads")
          .select("id,title,status,error,created_at")
          .order("created_at", { ascending: false })
          .limit(25),
      ]);
    if (
      [profiles, visuals, tracks, pending, catalogue, uploads].some(
        (result) => result.error,
      )
    )
      throw new Error("Dashboard unavailable.");
    return Response.json(
      {
        stats: {
          users: profiles.count,
          visualisations: visuals.count,
          tracks: tracks.count,
          pending: pending.count,
        },
        tracks: catalogue.data,
        uploads: uploads.data,
        hasMore: (page + 1) * 25 < (tracks.count ?? 0),
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof AdminAuthorizationError
            ? error.message
            : "Dashboard unavailable. Check the server configuration and database migrations.",
      },
      { status: error instanceof AdminAuthorizationError ? error.status : 503 },
    );
  }
}
