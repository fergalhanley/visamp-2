import { NextResponse } from "next/server";

import { listHostedTracks } from "@/lib/hosted-audio/server";
import { checkApiRateLimit } from "@/lib/rate-limit";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
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

  const { slug } = await params;
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    return NextResponse.json({ error: "Artist not found" }, { status: 404 });
  }

  try {
    const tracks = await listHostedTracks(slug);
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
            : "Could not load artist tracks",
      },
      { status: 503 },
    );
  }
}
