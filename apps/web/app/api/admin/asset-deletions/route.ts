import { NextResponse } from "next/server";

import {
  AdminAuthorizationError,
  requireAdmin,
} from "@/lib/hosted-audio/admin";
import { processAssetDeletions } from "@/lib/assets/deletions";

/**
 * Drains the whole asset cleanup outbox, not one asset's worth. Withdrawal
 * drains its own object opportunistically, but failed uploads, owner deletions
 * and any withdrawal whose delete errored are only ever cleared here — without
 * a scheduled call they sit pending forever and the bytes are paid for
 * indefinitely. Mirrors /api/admin/audio-deletions.
 */
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
    const result = await processAssetDeletions({ limit: 100 });
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
