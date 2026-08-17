import { NextResponse, type NextRequest } from "next/server";

import { STARTER_SOURCE } from "@/lib/dsl/starter";
import { createClient } from "@/lib/supabase/server";

/**
 * Provisions a new draft and sends the author into the editor.
 *
 * POST rather than GET on purpose: this creates a row, and a GET target can be
 * speculatively prefetched by the browser, which would litter the table with
 * empty drafts.
 */
export async function POST(request: NextRequest) {
  const { origin } = new URL(request.url);
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(`${origin}/`, { status: 303 });
  }

  const { data, error } = await supabase
    .from("visualisations")
    .insert({
      owner_id: user.id,
      title: "Untitled",
      source: STARTER_SOURCE,
      visibility: "private",
    })
    .select("id")
    .single();

  if (error || !data) {
    return NextResponse.redirect(
      `${origin}/auth/error?reason=${encodeURIComponent(error?.message ?? "Could not create visualisation")}`,
      { status: 303 },
    );
  }

  // 303 so the browser follows with GET rather than repeating the POST.
  return NextResponse.redirect(`${origin}/edit/${data.id}`, { status: 303 });
}

/** Nothing to show at /edit itself. */
export async function GET(request: NextRequest) {
  const { origin } = new URL(request.url);
  return NextResponse.redirect(`${origin}/`, { status: 307 });
}
