import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Session refresh. Next 16 renamed Middleware to Proxy; behaviour is the same.
 *
 * This runs on every matched request purely to keep auth tokens fresh — it is
 * deliberately not an authorization layer. Authorization lives in RLS.
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
          // Cache-control headers supplied by @supabase/ssr. Without these a
          // CDN could cache a response carrying one user's session cookie and
          // hand it to somebody else.
          Object.entries(headers).forEach(([key, value]) =>
            response.headers.set(key, value),
          );
        },
      },
    },
  );

  // Verifies the JWT signature locally and refreshes it when needed. Do not
  // swap this for getSession(), which trusts whatever is in the cookie.
  await supabase.auth.getClaims();

  return response;
}

export const config = {
  matcher: [
    /*
     * Everything except static assets and image files — those never carry a
     * session and refreshing on them is wasted work.
     */
    "/((?!_next/static|_next/image|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|wasm)$).*)",
  ],
};
