import { NextResponse } from "next/server";

import {
  AdminAuthorizationError,
  requireAdmin,
} from "@/lib/hosted-audio/admin";
import { createAdminClient } from "@/lib/supabase/admin";

function authError(error: unknown): NextResponse | null {
  return error instanceof AdminAuthorizationError
    ? NextResponse.json({ error: error.message }, { status: error.status })
    : null;
}

export async function POST(request: Request) {
  try {
    await requireAdmin();
    const body = (await request.json()) as Record<string, unknown>;
    if (
      typeof body.slug !== "string" ||
      typeof body.title !== "string" ||
      typeof body.musicArtistId !== "string" ||
      typeof body.durationMs !== "number"
    ) {
      return NextResponse.json(
        { error: "Missing required track fields" },
        { status: 400 },
      );
    }

    const { data, error } = await createAdminClient()
      .from("tracks")
      .insert({
        slug: body.slug,
        title: body.title,
        music_artist_id: body.musicArtistId,
        licence_id: typeof body.licenceId === "string" ? body.licenceId : null,
        duration_ms: Math.round(body.durationMs),
        status: "ingesting",
      })
      .select("id, status")
      .single();
    if (error)
      return NextResponse.json({ error: error.message }, { status: 409 });
    return NextResponse.json({ track: data }, { status: 201 });
  } catch (error) {
    return (
      authError(error) ??
      NextResponse.json(
        {
          error:
            error instanceof Error ? error.message : "Could not create track",
        },
        { status: 500 },
      )
    );
  }
}
