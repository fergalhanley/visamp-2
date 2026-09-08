import { NextResponse } from "next/server";

import {
  getHostedPlayback,
  HostedAudioHttpError,
} from "@/lib/hosted-audio/server";
import { checkApiRateLimit } from "@/lib/rate-limit";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const rate = await checkApiRateLimit(request, "playback", 60, 60_000);
  if (!rate.allowed) {
    return NextResponse.json(
      { error: rate.configured ? "Too many playback requests" : "Playback unavailable" },
      {
        status: rate.configured ? 429 : 503,
        headers: { "Retry-After": String(rate.retryAfterSeconds) },
      },
    );
  }

  const { id } = await params;
  if (!UUID.test(id)) {
    return NextResponse.json({ error: "Track not found" }, { status: 404 });
  }

  try {
    const playback = await getHostedPlayback(id);
    return NextResponse.json(playback, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    if (error instanceof HostedAudioHttpError) {
      return NextResponse.json(
        { error: error.message, ...error.detail },
        {
          status: error.status,
          headers: { "Cache-Control": "private, no-store" },
        },
      );
    }
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Playback unavailable",
      },
      { status: 503, headers: { "Cache-Control": "private, no-store" } },
    );
  }
}
