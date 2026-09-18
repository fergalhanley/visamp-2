import { serverEvent } from "@/lib/analytics/server";
import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";

/**
 * OAuth and PKCE landing point. Supabase redirects here with a `code`, which we
 * trade for a session; the cookies are written by the server client.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  // Only ever redirect within this site — an attacker-supplied absolute URL
  // here would turn the callback into an open redirect.
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/";

  if (!code) {
    return NextResponse.redirect(`${origin}/auth/error?reason=missing_code`);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(
      `${origin}/auth/error?reason=${encodeURIComponent(error.message)}`,
    );
  }

  if (data?.user) {
    const method = data.user.app_metadata.provider === "google" ? "google" : data.user.app_metadata.provider === "github" ? "github" : "email";
    if (!safeNext.startsWith("/auth/reset-password")) await serverEvent(request, data.user.id, "login_completed", { method });
    // OAuth creates and signs in a new account in the same exchange. Stable ID
    // ensures that callback retries cannot count signup more than once.
    const flowStarted = Number(request.cookies.get("visamp_analytics_auth_started")?.value);
    if (method !== "email" && Number.isFinite(flowStarted) && flowStarted > Date.now() - 600_000 && Date.parse(data.user.created_at) >= flowStarted)
      await serverEvent(request, data.user.id, "signup_completed", { method }, `signup:${data.user.id}`);
  }
  return NextResponse.redirect(`${origin}${safeNext}`);
}
