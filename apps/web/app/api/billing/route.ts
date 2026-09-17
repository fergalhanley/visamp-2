import { createClient } from "@/lib/supabase/server";
import { creditSummary } from "@/lib/billing/server";

export async function GET() {
  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user)
    return Response.json({ error: "Sign in to view credits" }, { status: 401 });
  try {
    return Response.json(await creditSummary(user.id), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch {
    return Response.json(
      { error: "Credit information is temporarily unavailable" },
      { status: 503 },
    );
  }
}
