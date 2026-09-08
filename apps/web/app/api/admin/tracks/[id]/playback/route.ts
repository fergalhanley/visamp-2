import { NextResponse } from "next/server";

import {
  AdminAuthorizationError,
  requireAdmin,
} from "@/lib/hosted-audio/admin";
import {
  getAdminHostedPlayback,
  HostedAudioHttpError,
} from "@/lib/hosted-audio/server";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdmin();
    const { id } = await params;
    const playback = await getAdminHostedPlayback(id);
    return NextResponse.json(playback, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    if (error instanceof AdminAuthorizationError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    }
    if (error instanceof HostedAudioHttpError) {
      return NextResponse.json(
        { error: error.message, ...error.detail },
        { status: error.status },
      );
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Preview unavailable" },
      { status: 503 },
    );
  }
}
