import {
  identity,
  body,
  respond,
  failure,
  SetError,
  checkId,
} from "@/lib/sets/api";
import { emptySet, fromRow, parseSet } from "@/lib/sets/model";
export async function GET(request: Request) {
  try {
    const { db, userId } = await identity(request);
    const { data, error } = await db
      .from("performance_sets")
      .select("*")
      .eq("owner_id", userId)
      .order("updated_at", { ascending: false });
    if (error) throw error;
    return respond({ sets: data.map(fromRow) });
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: Request) {
  try {
    const { db, userId } = await identity(request, true);
    const input = await body(request);
    let content = emptySet();
    if (input.duplicateId) {
      checkId(String(input.duplicateId));
      const { data, error } = await db
        .from("performance_sets")
        .select("*")
        .eq("owner_id", userId)
        .eq("id", String(input.duplicateId))
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new SetError(404, "Set not found.");
      content = parseSet(data.content);
      content.name = `${content.name.slice(0, 150)} (copy)`;
      content.audioClips = content.audioClips.map((c) => ({
        ...c,
        id: crypto.randomUUID(),
      }));
      content.visualClips = content.visualClips.map((c) => ({
        ...c,
        id: crypto.randomUUID(),
      }));
    }
    const { data, error } = await db
      .from("performance_sets")
      .insert({ owner_id: userId, content })
      .select("*")
      .single();
    if (error) throw error;
    return respond(fromRow(data), 201);
  } catch (e) {
    return failure(e);
  }
}
