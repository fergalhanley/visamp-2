import { createHmac, randomUUID } from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient as createSessionClient } from "@/lib/supabase/server";
import { checkApiRateLimit } from "@/lib/rate-limit";

const LISTENER_COOKIE = "visamp_listener_id";
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) {
    return NextResponse.json(
      { error: "Cross-origin play events are not accepted" },
      { status: 403 },
    );
  }
  const rate = await checkApiRateLimit(request, "play", 20, 60_000);
  if (!rate.allowed) {
    return NextResponse.json(
      { error: rate.configured ? "Too many play events" : "Play counting unavailable" },
      {
        status: rate.configured ? 429 : 503,
        headers: { "Retry-After": String(rate.retryAfterSeconds) },
      },
    );
  }

  const { id } = await params;
  if (!UUID.test(id)) {
    return NextResponse.json({ counted: false }, { status: 404 });
  }

  const secret = process.env.AUDIO_LISTENER_HMAC_KEY;
  if (!secret) {
    return NextResponse.json(
      { error: "Play counting is not configured" },
      { status: 503 },
    );
  }

  let context = "vis";
  try {
    const body = (await request.json()) as { context?: unknown };
    if (typeof body.context === "string") context = body.context;
  } catch {
    // Empty body uses the normal visualisation context.
  }
  if (!new Set(["vis", "set", "vj", "preview"]).has(context)) {
    return NextResponse.json(
      { error: "Invalid playback context" },
      { status: 400 },
    );
  }

  const session = await createSessionClient();
  const { data } = await session.auth.getUser();
  const listenerId =
    request.cookies.get(LISTENER_COOKIE)?.value ?? randomUUID();
  const identity = data.user ? `user:${data.user.id}` : `anon:${listenerId}`;
  const listenerHash = createHmac("sha256", secret)
    .update(identity)
    .digest("hex");

  const { data: counted, error } = await createAdminClient().rpc(
    "record_hosted_track_play",
    {
      p_track_id: id,
      p_listener_hash: listenerHash,
      p_user_id: data.user?.id ?? null,
      p_context: context,
    },
  );
  if (error) {
    return NextResponse.json(
      { error: "Could not record play" },
      { status: 503 },
    );
  }

  const response = NextResponse.json({ counted: Boolean(counted) });
  if (!data.user && !request.cookies.has(LISTENER_COOKIE)) {
    response.cookies.set(LISTENER_COOKIE, listenerId, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 60 * 24 * 365,
      path: "/",
    });
  }
  return response;
}
