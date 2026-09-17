import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user)
    return Response.json(
      { error: "Sign in to download your result" },
      { status: 401 },
    );
  const { id } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(id))
    return Response.json({ error: "Invalid result" }, { status: 400 });
  const { data, error } = await createAdminClient()
    .from("ai_generation_requests")
    .select("generated_source")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();
  if (error || !data.generated_source)
    return Response.json({ error: "Result unavailable" }, { status: 404 });
  return new Response(data.generated_source, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "private, no-store",
      "Content-Disposition": `attachment; filename="visamp-${id}.viscript"`,
    },
  });
}
