import { serverEvent } from "@/lib/analytics/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";

/**
 * Email link landing point — signup confirmation and recovery. Supabase sends a
 * a PKCE `code` with the default template, or `token_hash` with custom templates.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = searchParams.get("next") ?? "/";

  const safeNext =
    next.startsWith("/") &&
    !next.startsWith("//") &&
    !/[\\\x00-\x1f]/.test(next)
      ? next
      : "/";

  if (!code && (!tokenHash || !type)) {
    return NextResponse.redirect(`${origin}/auth/error?reason=missing_token`);
  }

  const supabase = await createClient();
  const { data, error } = code
    ? await supabase.auth.exchangeCodeForSession(code)
    : await supabase.auth.verifyOtp({ type: type!, token_hash: tokenHash! });

  if (error) {
    return NextResponse.redirect(
      `${origin}/auth/error?reason=${encodeURIComponent(error.message)}`,
    );
  }

  if (data?.user) {
    const method = data.user.app_metadata.provider === "google" ? "google" : data.user.app_metadata.provider === "github" ? "github" : "email";
    if (type !== "recovery") await serverEvent(request, data.user.id, "login_completed", { method });
    if (type === "signup" || (code && !safeNext.startsWith("/auth/reset-password")))
      await serverEvent(request, data.user.id, "signup_completed", { method: "email" }, `signup:${data.user.id}`);
  }
  return NextResponse.redirect(`${origin}${safeNext}`);
}
