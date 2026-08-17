import { NextResponse, type NextRequest } from "next/server";

import { resolvePlaylist } from "@/lib/soundcloud/server";

/** Only accept SoundCloud permalinks — this endpoint is not a general fetcher. */
function isSoundCloudUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      (url.hostname === "soundcloud.com" || url.hostname.endsWith(".soundcloud.com"))
    );
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  let url: unknown;

  try {
    ({ url } = (await request.json()) as { url?: unknown });
  } catch {
    return NextResponse.json({ error: "Expected a JSON body" }, { status: 400 });
  }

  if (typeof url !== "string" || !isSoundCloudUrl(url)) {
    return NextResponse.json(
      { error: "Enter a https://soundcloud.com playlist link" },
      { status: 400 },
    );
  }

  try {
    const playlist = await resolvePlaylist(url);
    return NextResponse.json(playlist);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not read that playlist" },
      { status: 502 },
    );
  }
}
