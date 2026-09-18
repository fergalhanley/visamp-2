import { checkApiRateLimit } from "@/lib/rate-limit";
import { NextResponse } from "next/server";
import { analyticsEnvironment } from "@/lib/analytics/config";
import {
  analyticsRpc,
  receiptCookie,
  receiptFromRequest,
} from "@/lib/analytics/server";

export async function POST(request: Request) {
  const url = new URL(request.url);
  if (request.headers.get("origin") !== url.origin)
    return NextResponse.json({}, { status: 403 });
  const body = await request.json().catch(() => null);
  if (typeof body?.accepted !== "boolean")
    return NextResponse.json({}, { status: 400 });
  const receipt = receiptFromRequest(request);
  try {
    const environment = analyticsEnvironment(
      process.env.VERCEL_ENV,
      url.hostname,
      body.environment !== "production",
    );
    const existing = receipt
      ? ((await analyticsRpc("active", { receipt })) as {
          id: string;
          environment: string;
        } | null)
      : null;
    if (body.accepted && !existing) {
      const rate = await checkApiRateLimit(
        request,
        "analytics-consent",
        30,
        600_000,
      );
      if (!rate.allowed)
        return NextResponse.json(
          { error: "Please retry shortly." },
          { status: 429 },
        );
    }
    const reuse = body.accepted && existing?.environment === environment;
    if (receipt && !reuse) await analyticsRpc("revoke", { receipt });
    const data = reuse
      ? existing
      : body.accepted
        ? ((await analyticsRpc("consent", { environment })) as { id: string })
        : null;
    const response = NextResponse.json(
      { accepted: body.accepted },
      { headers: { "Cache-Control": "private, no-store" } },
    );
    response.cookies.set(receiptCookie, data?.id ?? "", {
      httpOnly: true,
      secure: url.protocol === "https:",
      sameSite: "lax",
      path: "/",
      maxAge: data ? 31536000 : 0,
    });
    return response;
  } catch {
    return NextResponse.json(
      { error: "Could not save server analytics preference. Please retry." },
      { status: 503 },
    );
  }
}
