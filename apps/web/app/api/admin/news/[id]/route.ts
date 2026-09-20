import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/hosted-audio/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { newsError, sameOrigin } from "@/lib/news/http";
import { parseNewsInput, uuidPattern } from "@/lib/news/types";
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdmin();
    if (!sameOrigin(request))
      return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
    const { id } = await params;
    if (!uuidPattern.test(id))
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    let input, version: string;
    try {
      const body = await request.json();
      input = parseNewsInput(body);
      if (
        typeof body.updated_at !== "string" ||
        !Number.isFinite(Date.parse(body.updated_at))
      )
        throw new Error("Reload the post before saving.");
      version = body.updated_at;
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Invalid post" },
        { status: 400 },
      );
    }
    const db = createAdminClient();
    const { data: current, error: readError } = await db
      .from("news_posts")
      .select("published_at")
      .eq("id", id)
      .maybeSingle();
    if (readError) throw readError;
    if (!current)
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    const { data, error } = await db
      .from("news_posts")
      .update({
        ...input,
        published_at:
          input.status === "published"
            ? (current.published_at ?? new Date().toISOString())
            : current.published_at,
      })
      .eq("id", id)
      .eq("updated_at", version)
      .select("*")
      .maybeSingle();
    if (error) throw error;
    if (!data)
      return NextResponse.json(
        {
          error:
            "This post changed in another session. Copy your changes, then reopen the post.",
        },
        { status: 409 },
      );
    return NextResponse.json({ post: data });
  } catch (error) {
    return newsError(error);
  }
}
