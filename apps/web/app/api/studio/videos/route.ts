import { createClient } from "@/lib/supabase/server";
import { emptyVideo, type VideoSummary } from "@/lib/videos/model";

async function identity() {
  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  return { db, user };
}

function summary(row: {
  id: string;
  title: string;
  status: "draft" | "rendering" | "ready" | "error";
  updated_at: string;
  distribution_state: unknown;
  schedule_state: unknown;
}): VideoSummary {
  return {
    id: row.id,
    title: row.title,
    status: row.status,
    updatedAt: row.updated_at,
    distributionState:
      row.distribution_state &&
      typeof row.distribution_state === "object" &&
      !Array.isArray(row.distribution_state)
        ? (row.distribution_state as Record<string, unknown>)
        : {},
    scheduleState:
      row.schedule_state &&
      typeof row.schedule_state === "object" &&
      !Array.isArray(row.schedule_state)
        ? (row.schedule_state as Record<string, unknown>)
        : {},
  };
}

export async function GET() {
  const { db, user } = await identity();
  if (!user)
    return Response.json({ error: "Sign in to use Studio." }, { status: 401 });

  const { data, error } = await db
    .from("videos")
    .select("id,title,status,updated_at,distribution_state,schedule_state")
    .order("updated_at", { ascending: false })
    .limit(200);

  if (error)
    return Response.json(
      { error: "Could not load your videos." },
      { status: 503 },
    );

  return Response.json(
    { videos: (data ?? []).map(summary) },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

export async function POST(request: Request) {
  const { db, user } = await identity();
  if (!user)
    return Response.json({ error: "Sign in to use Studio." }, { status: 401 });
  if (request.headers.get("origin") !== new URL(request.url).origin)
    return Response.json({ error: "Invalid request origin." }, { status: 403 });

  const { data, error } = await db
    .from("videos")
    .insert({
      owner_id: user.id,
      title: "Untitled video",
      content: emptyVideo(),
    })
    .select("id,title,status,updated_at,distribution_state,schedule_state")
    .single();

  if (error || !data)
    return Response.json(
      { error: "Could not create a video." },
      { status: 503 },
    );

  return Response.json(
    { video: summary(data) },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
