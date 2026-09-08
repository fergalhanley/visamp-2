import { createHmac, randomUUID } from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient as createSessionClient } from "@/lib/supabase/server";

const VIEWER_COOKIE = "visamp_viewer_id";
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function clientAddress(request: Request): string {
  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;
  return (
    request.headers.get("x-forwarded-for")?.split(",").at(-1)?.trim() ||
    "unknown"
  );
}

function digest(secret: string, value: string): string {
  return createHmac("sha256", secret).update(value).digest("hex");
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) {
    return NextResponse.json({ counted: false }, { status: 403 });
  }

  const { id } = await params;
  if (!UUID.test(id)) {
    return NextResponse.json({ counted: false }, { status: 404 });
  }

  const secret = process.env.VIEW_LISTENER_HMAC_KEY;
  if (!secret || secret.length < 32) {
    return NextResponse.json(
      { error: "View counting is not configured" },
      { status: 503 },
    );
  }

  const session = await createSessionClient();
  const { data } = await session.auth.getUser();
  const anonymousId = request.cookies.get(VIEWER_COOKIE)?.value ?? randomUUID();
  const identity = data.user ? `user:${data.user.id}` : `anon:${anonymousId}`;

  const { data: counted, error } = await createAdminClient().rpc(
    "record_vis_view",
    {
      p_vis_id: id,
      p_viewer_hash: digest(secret, identity),
      p_network_hash: digest(secret, `network:${clientAddress(request)}`),
      p_user_id: data.user?.id ?? null,
    },
  );

  if (error) {
    return NextResponse.json(
      { error: "Could not record view" },
      { status: 503 },
    );
  }

  const response = NextResponse.json(
    { counted: Boolean(counted) },
    { headers: { "Cache-Control": "private, no-store" } },
  );
  if (!data.user && !request.cookies.has(VIEWER_COOKIE)) {
    response.cookies.set(VIEWER_COOKIE, anonymousId, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 60 * 24 * 365,
      path: "/",
    });
  }
  return response;
}
