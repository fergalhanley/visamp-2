import "server-only";
import type { createAdminClient } from "@/lib/supabase/admin";
import { SetError } from "@/lib/sets/api";
import { fromRow } from "@/lib/sets/model";
import type { StudioSelection, StudioSets } from "./model";

type Database = ReturnType<typeof createAdminClient>;
const selection = (row: {
  set_id: string;
  selected_at: string;
}): StudioSelection => ({
  setId: row.set_id,
  selectedAt: row.selected_at,
});

export async function listStudioSets(
  db: Database,
  userId: string,
): Promise<StudioSets> {
  const [sets, selections] = await Promise.all([
    db
      .from("performance_sets")
      .select("*")
      .eq("owner_id", userId)
      .order("updated_at", { ascending: false }),
    db
      .from("studio_sets")
      .select("set_id,selected_at,performance_sets!inner(owner_id)")
      .eq("performance_sets.owner_id", userId)
      .order("selected_at", { ascending: false }),
  ]);
  if (sets.error) throw sets.error;
  if (selections.error) throw selections.error;
  return {
    sets: (sets.data ?? []).map(fromRow),
    selections: (selections.data ?? []).map(selection),
  };
}

/** Selecting an owned Set is idempotent and does not copy or freeze the draft. */
export async function selectStudioSet(
  db: Database,
  userId: string,
  setId: string,
): Promise<StudioSelection> {
  const { data: set, error: readError } = await db
    .from("performance_sets")
    .select("id")
    .eq("id", setId)
    .eq("owner_id", userId)
    .maybeSingle();
  if (readError) throw readError;
  if (!set) throw new SetError(404, "Set not found.");
  const { error: writeError } = await db
    .from("studio_sets")
    .upsert(
      { set_id: setId },
      { onConflict: "set_id", ignoreDuplicates: true },
    );
  if (writeError) throw writeError;
  const { data, error } = await db
    .from("studio_sets")
    .select("set_id,selected_at")
    .eq("set_id", setId)
    .single();
  if (error) throw error;
  return selection(data);
}
