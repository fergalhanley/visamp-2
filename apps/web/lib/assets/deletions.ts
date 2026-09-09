import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

import { ASSET_BUCKET } from "./server.ts";

interface DeletionRow {
  id: number;
  object_key: string;
  attempts: number;
}

export interface DeletionResult {
  completed: number;
  failed: number;
}

/**
 * Drains the object-cleanup outbox. Storage deletes cannot join the transaction
 * that decided them, so the decision is recorded first and carried out here.
 */
export async function processAssetDeletions(options?: {
  assetId?: string;
  limit?: number;
}): Promise<DeletionResult> {
  const admin = createAdminClient();
  let query = admin
    .from("asset_deletions")
    .select("id, object_key, attempts")
    .is("completed_at", null)
    // A job that keeps failing must not block the ones behind it. Ten attempts
    // is enough to ride out a storage outage; past that it needs a person.
    .lt("attempts", 10)
    .order("created_at", { ascending: true })
    .limit(options?.limit ?? 50);
  if (options?.assetId) query = query.eq("asset_id", options.assetId);

  const { data, error } = await query;
  if (error)
    throw new Error(`Could not read asset deletion outbox: ${error.message}`);

  const result: DeletionResult = { completed: 0, failed: 0 };
  for (const row of (data ?? []) as DeletionRow[]) {
    const removal = await admin.storage.from(ASSET_BUCKET).remove([row.object_key]);
    if (removal.error) {
      await admin
        .from("asset_deletions")
        .update({
          attempts: row.attempts + 1,
          last_error: removal.error.message.slice(0, 1000),
        })
        .eq("id", row.id);
      result.failed += 1;
      continue;
    }
    const { error: updateError } = await admin
      .from("asset_deletions")
      .update({
        attempts: row.attempts + 1,
        completed_at: new Date().toISOString(),
        last_error: null,
      })
      .eq("id", row.id);
    if (updateError) {
      result.failed += 1;
      continue;
    }
    result.completed += 1;
  }
  return result;
}
