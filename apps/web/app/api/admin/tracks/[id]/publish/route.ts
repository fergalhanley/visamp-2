import { NextResponse } from "next/server";

import {
  AdminAuthorizationError,
  requireAdmin,
} from "@/lib/hosted-audio/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { sameOrigin } from "@/lib/hosted-audio/uploads";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    sameOrigin(request);
    await requireAdmin();
    const { id } = await params;
    const { data, error } = await createAdminClient()
      .from("tracks")
      .update({ status: "live" })
      .eq("id", id)
      .eq("status", "draft")
      .select("id, status, published_at")
      .maybeSingle();
    if (error)
      return NextResponse.json({ error: error.message }, { status: 409 });
    if (!data)
      return NextResponse.json(
        { error: "Draft track not found" },
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
          error instanceof Error ? error.message : "Could not publish track",
      },
      { status: 500 },
    );
  }
}
