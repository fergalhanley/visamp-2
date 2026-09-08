import { NextResponse } from "next/server";

import {
  AdminAuthorizationError,
  requireAdmin,
} from "@/lib/hosted-audio/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";
import { sameOrigin } from "@/lib/hosted-audio/uploads";

const fieldMap = {
  title: "title",
  album: "album",
  year: "year",
  isrc: "isrc",
  bpm: "bpm",
  musicalKey: "musical_key",
  genreTags: "genre_tags",
  isExplicit: "is_explicit",
  downloadAllowed: "download_allowed",
  licenceId: "licence_id",
} as const;

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    sameOrigin(request);
    await requireAdmin();
    const { id } = await params;
    const body = (await request.json()) as Record<string, unknown>;
    if (!body || typeof body !== "object" || Array.isArray(body))
      return NextResponse.json({ error: "Invalid track details." }, { status: 400 });
    if (Object.hasOwn(body, "title") && (typeof body.title !== "string" || !body.title.trim() || body.title.length > 200))
      return NextResponse.json({ error: "Title must be between 1 and 200 characters." }, { status: 400 });
    if (Object.hasOwn(body, "album") && body.album !== null && (typeof body.album !== "string" || body.album.length > 200))
      return NextResponse.json({ error: "Album must be 200 characters or fewer." }, { status: 400 });
    const updates: Database["public"]["Tables"]["tracks"]["Update"] = {};
    for (const [input, column] of Object.entries(fieldMap)) {
      if (Object.hasOwn(body, input)) {
        (updates as Record<string, unknown>)[column] = body[input];
      }
    }
    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: "No supported fields supplied" },
        { status: 400 },
      );
    }

    const { data, error } = await createAdminClient()
      .from("tracks")
      .update(updates)
      .eq("id", id)
      .in("status", ["ingesting", "draft", "live"])
      .select("id, status, updated_at")
      .maybeSingle();
    if (error)
      return NextResponse.json({ error: error.message }, { status: 409 });
    if (!data)
      return NextResponse.json(
        { error: "Editable track not found" },
        { status: 404 },
      );
    return NextResponse.json({ track: data });
  } catch (error) {
    if (error instanceof AdminAuthorizationError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    }
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Could not update track",
      },
      { status: 500 },
    );
  }
}
