import { NextResponse } from "next/server";

import { AdminAuthorizationError, requireAdmin } from "@/lib/hosted-audio/admin";
import { processAssetDeletions } from "@/lib/assets/deletions";
import { createAdminClient } from "@/lib/supabase/admin";
import { sameOrigin } from "@/lib/hosted-audio/uploads";

/**
 * Takes an asset out of service everywhere at once. The admin check is repeated
 * inside `withdraw_asset` so the rule survives a caller that forgets it here.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    sameOrigin(request);
    const { userId } = await requireAdmin();
    const { id } = await params;

    let replacementAssetId: string | null = null;
    try {
      const body = (await request.json()) as { replacementAssetId?: unknown };
      if (typeof body.replacementAssetId === "string")
        replacementAssetId = body.replacementAssetId;
    } catch {
      // An empty body withdraws without offering a replacement.
    }

    const admin = createAdminClient();
    const { error } = await admin.rpc("withdraw_asset", {
      p_asset_id: id,
      p_actor_id: userId,
      p_replacement_asset_id: replacementAssetId,
    });
    if (error)
      return NextResponse.json({ error: error.message }, { status: 409 });

    // Which visuals are now affected. VIS-55 owns warning them and the
    // 24-hour repair window; this is the evidence it works from.
    const affected = await admin
      .from("visualisation_assets")
      .select("visualisation_id")
      .eq("asset_id", id)
      .limit(1000);

    const deletions = await processAssetDeletions({ assetId: id, limit: 50 });
    return NextResponse.json({
      withdrawn: true,
      affectedVisualisations: (affected.data ?? []).map((row) => row.visualisation_id),
      deletions,
    });
  } catch (error) {
    if (error instanceof AdminAuthorizationError)
      return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Could not withdraw asset",
      },
      { status: 500 },
    );
  }
}
