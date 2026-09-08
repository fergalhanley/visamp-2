import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

import { deleteR2Object } from "./r2";

interface DeletionRow {
  id: number;
  bucket: "media-visamp-io" | "visamp-masters";
  object_key: string;
  attempts: number;
}

export interface DeletionResult {
  completed: number;
  failed: number;
}

export async function processHostedAudioDeletions(options?: {
  trackId?: string;
  limit?: number;
}): Promise<DeletionResult> {
  const admin = createAdminClient();
  let query = admin
    .from("track_asset_deletions")
    .select("id, bucket, object_key, attempts")
    .is("completed_at", null)
    .order("created_at", { ascending: true })
    .limit(options?.limit ?? 50);
  if (options?.trackId) query = query.eq("track_id", options.trackId);

  const { data, error } = await query;
  if (error)
    throw new Error(`Could not read audio deletion outbox: ${error.message}`);

  const result: DeletionResult = { completed: 0, failed: 0 };
  for (const row of (data ?? []) as DeletionRow[]) {
    try {
      await deleteR2Object(row.bucket, row.object_key);
      const { error: updateError } = await admin
        .from("track_asset_deletions")
        .update({
          attempts: row.attempts + 1,
          completed_at: new Date().toISOString(),
          last_error: null,
        })
        .eq("id", row.id);
      if (updateError) throw updateError;
      result.completed += 1;
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      await admin
        .from("track_asset_deletions")
        .update({
          attempts: row.attempts + 1,
          last_error: message.slice(0, 1000),
        })
        .eq("id", row.id);
      result.failed += 1;
    }
  }
  return result;
}
