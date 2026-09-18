import { createClient } from "@/lib/supabase/server";

/** A history-restored page must read current saved content before editing. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const headers = { "Cache-Control": "private, no-store" };
  try {
    const { id } = await params;
    const supabase = await createClient();
    const [
      {
        data: { user },
      },
      { data: visualisation, error },
    ] = await Promise.all([
      supabase.auth.getUser(),
      supabase.from("visualisations").select("*").eq("id", id).maybeSingle(),
    ]);
    if (error) throw error;
    return Response.json(
      {
        visualisation,
        canEdit: Boolean(user && visualisation?.owner_id === user.id),
      },
      { headers },
    );
  } catch {
    return Response.json(
      {
        error:
          "Could not load the latest saved visualisation. Please try again.",
      },
      { status: 503, headers },
    );
  }
}
