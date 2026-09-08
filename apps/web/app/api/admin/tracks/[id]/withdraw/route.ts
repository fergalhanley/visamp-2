import { NextResponse } from "next/server";

import {
  AdminAuthorizationError,
  requireAdmin,
} from "@/lib/hosted-audio/admin";
import { processHostedAudioDeletions } from "@/lib/hosted-audio/deletions";
import { createAdminClient } from "@/lib/supabase/admin";
import { sameOrigin } from "@/lib/hosted-audio/uploads";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    sameOrigin(request);
    await requireAdmin();
    const { id } = await params;
    let deleteMaster = false;
    try {
      const body = (await request.json()) as { deleteMaster?: unknown };
      deleteMaster = body.deleteMaster === true;
    } catch {
      // Empty body keeps the master, subject to the licence retention terms.
    }

    const { error } = await createAdminClient().rpc("withdraw_hosted_track", {
      p_track_id: id,
      p_delete_master: deleteMaster,
    });
    if (error)
      return NextResponse.json({ error: error.message }, { status: 409 });

    const deletions = await processHostedAudioDeletions({
      trackId: id,
      limit: 50,
    });
    return NextResponse.json({ withdrawn: true, deletions });
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
          error instanceof Error ? error.message : "Could not withdraw track",
      },
      { status: 500 },
    );
  }
}
