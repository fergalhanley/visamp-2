import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/hosted-audio/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { newsError, sameOrigin } from "@/lib/news/http";
import { parseNewsInput } from "@/lib/news/types";
export async function GET(request: Request) {
  try {
    await requireAdmin();
    const page = Math.max(
      0,
      Math.min(
        10000,
        Number(new URL(request.url).searchParams.get("page")) || 0,
      ),
    );
    const { data, error } = await createAdminClient()
      .from("news_posts")
      .select("*")
      .order("created_at", { ascending: false })
      .order("id")
      .range(page * 20, page * 20 + 20);
    if (error) throw error;
    return NextResponse.json(
      { posts: data.slice(0, 20), hasMore: data.length > 20 },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return newsError(error);
  }
}
export async function POST(request: Request) {
  try {
    await requireAdmin();
    if (!sameOrigin(request))
      return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
    let input;
    try {
      input = parseNewsInput(await request.json());
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Invalid post" },
        { status: 400 },
      );
    }
    const { data, error } = await createAdminClient()
      .from("news_posts")
      .insert({
        ...input,
        published_at:
          input.status === "published" ? new Date().toISOString() : null,
      })
      .select("*")
      .single();
    if (error) throw error;
    return NextResponse.json({ post: data }, { status: 201 });
  } catch (error) {
    return newsError(error);
  }
}
