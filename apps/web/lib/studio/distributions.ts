import "server-only";
import type { createAdminClient } from "@/lib/supabase/admin";
import type { Database as Schema } from "@/lib/supabase/database.types";
import { SetError } from "@/lib/sets/api";
import {
  defaultMasterSettings,
  parseMasterSettings,
  type Distribution,
} from "./distributions-model";

type Database = ReturnType<typeof createAdminClient>;
const fromRow = (
  row: Schema["public"]["Tables"]["set_distributions"]["Row"],
): Distribution => ({
  id: row.id,
  setId: row.set_id,
  target: row.target,
  status: row.status,
  settings: row.settings,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});
async function ownedSet(db: Database, userId: string, setId: string) {
  const { data, error } = await db
    .from("performance_sets")
    .select("id,content")
    .eq("id", setId)
    .eq("owner_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new SetError(404, "Set not found.");
  return data;
}
export async function listDistributions(db: Database, userId: string) {
  const { data, error } = await db
    .from("set_distributions")
    .select("*,performance_sets!inner(owner_id)")
    .eq("performance_sets.owner_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(fromRow);
}
export async function addDistribution(
  db: Database,
  userId: string,
  setId: string,
  target: unknown,
) {
  if (target !== "master_download")
    throw new SetError(400, "This distribution target is not available yet.");
  const set = await ownedSet(db, userId, setId);
  const { error } = await db.from("set_distributions").upsert(
    {
      set_id: setId,
      target,
      settings: defaultMasterSettings(set.content.name),
    },
    { onConflict: "set_id,target", ignoreDuplicates: true },
  );
  if (error) throw error;
  const { data, error: readError } = await db
    .from("set_distributions")
    .select("*")
    .eq("set_id", setId)
    .eq("target", target)
    .single();
  if (readError) throw readError;
  return fromRow(data);
}
export async function saveDistribution(
  db: Database,
  userId: string,
  id: string,
  input: Record<string, unknown>,
) {
  const { data: current, error: readError } = await db
    .from("set_distributions")
    .select("*,performance_sets!inner(owner_id)")
    .eq("id", id)
    .eq("performance_sets.owner_id", userId)
    .maybeSingle();
  if (readError) throw readError;
  if (!current) throw new SetError(404, "Distribution not found.");
  if (
    typeof input.updatedAt !== "string" ||
    !Number.isFinite(Date.parse(input.updatedAt))
  )
    throw new SetError(400, "Missing save version.");
  let settings;
  try {
    settings = parseMasterSettings(input.settings);
  } catch (error) {
    throw new SetError(
      400,
      error instanceof Error ? error.message : "Invalid settings.",
    );
  }
  const { data, error } = await db
    .from("set_distributions")
    .update({ settings })
    .eq("id", current.id)
    .eq("updated_at", input.updatedAt)
    .select("*")
    .maybeSingle();
  if (error) throw error;
  if (!data)
    throw new SetError(
      409,
      "This distribution changed in another window. Your changes are retained; reload to compare before saving.",
    );
  return fromRow(data);
}
