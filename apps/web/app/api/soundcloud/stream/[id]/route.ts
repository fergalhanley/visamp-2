import { NextResponse } from "next/server";

import { resolveStreamUrl } from "@/lib/soundcloud/server";

/**
 * Hands back a signed HLS URL for a track.
 *
 * The audio itself is fetched by the browser straight from SoundCloud's CDN —
 * nothing is proxied through here, so this costs no bandwidth and adds no
 * latency to playback.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const trackId = Number(id);

  if (!Number.isInteger(trackId) || trackId <= 0) {
    return NextResponse.json({ error: "Invalid track id" }, { status: 400 });
  }

  try {
    const url = await resolveStreamUrl(trackId);
    // SoundCloud CDN signatures can be very short-lived. Never let a browser or
    // intermediary reuse a resolved URL for a later playback.
    return NextResponse.json(
      { url },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No stream available" },
      { status: 502 },
    );
  }
}
