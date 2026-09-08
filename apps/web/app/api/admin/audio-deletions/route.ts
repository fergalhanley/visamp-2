import { NextResponse } from "next/server";

import {
  AdminAuthorizationError,
  requireAdmin,
} from "@/lib/hosted-audio/admin";
import { processHostedAudioDeletions } from "@/lib/hosted-audio/deletions";

async function authorize(request: Request): Promise<void> {
  const cronSecret = process.env.CRON_SECRET;
  if (
    cronSecret &&
    request.headers.get("authorization") === `Bearer ${cronSecret}`
  )
    return;
  await requireAdmin();
}

export async function POST(request: Request) {
  try {
    await authorize(request);
    const result = await processHostedAudioDeletions({ limit: 100 });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof AdminAuthorizationError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    }
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Deletion processing failed",
      },
      { status: 500 },
    );
  }
}
