import { NextResponse } from "next/server";

import { listHostedTracks } from "@/lib/hosted-audio/server";
import { checkApiRateLimit } from "@/lib/rate-limit";

export async function GET(request: Request) {
  const rate = await checkApiRateLimit(request, "catalogue", 120, 60_000);
  if (!rate.allowed) {
    return NextResponse.json(
      { error: rate.configured ? "Too many catalogue requests" : "Catalogue unavailable" },
      {
        status: rate.configured ? 429 : 503,
        headers: { "Retry-After": String(rate.retryAfterSeconds) },
      },
    );
  }

  try {
    const tracks = await listHostedTracks();
    return NextResponse.json(
      { tracks },
      {
        headers: {
          "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
        },
      },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not load hosted tracks",
      },
      { status: 503 },
    );
  }
}
