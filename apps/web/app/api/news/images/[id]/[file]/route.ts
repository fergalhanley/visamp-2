import { createAdminClient } from "@/lib/supabase/admin";
import { createPublicClient } from "@/lib/supabase/public";
import {
  AdminAuthorizationError,
  requireAdmin,
} from "@/lib/hosted-audio/admin";
import { uuidPattern } from "@/lib/news/types";
import { newsError } from "@/lib/news/http";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; file: string }> },
) {
  const missing = () =>
    new Response(null, {
      status: 404,
      headers: { "Cache-Control": "private, no-store" },
    });
  try {
    const { id, file } = await params;
    if (
      !uuidPattern.test(id) ||
      !file.endsWith(".webp") ||
      !uuidPattern.test(file.slice(0, -5))
    )
      return missing();
    const { data: post, error } = await createPublicClient()
      .from("news_posts")
      .select("id")
      .eq("id", id)
      .eq("status", "published")
      .maybeSingle();
    if (error) throw error;
    if (!post) {
      try {
        await requireAdmin();
      } catch (error) {
        if (error instanceof AdminAuthorizationError) return missing();
        throw error;
      }
    }
    const { data, error: imageError } = await createAdminClient()
      .storage.from("news-images")
      .download(`${id}/${file}`);
    if (imageError || !data) return missing();
    return new Response(data, {
      headers: {
        "Content-Type": "image/webp",
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return newsError(error);
  }
}
