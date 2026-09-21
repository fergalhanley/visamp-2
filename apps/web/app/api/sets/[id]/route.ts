import {
  identity,
  body,
  respond,
  failure,
  SetError,
  checkId,
} from "@/lib/sets/api";
import { fromRow, parseSet, validate } from "@/lib/sets/model";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  try {
    const { db, userId } = await identity(request);
    const { id } = await context.params;
    checkId(id);
    const { data, error } = await db
      .from("performance_sets")
      .select("*")
      .eq("id", id)
      .eq("owner_id", userId)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new SetError(404, "Set not found.");
    return respond({ ...fromRow(data), validation: validate(data.content) });
  } catch (e) {
    return failure(e);
  }
}
export async function PUT(request: Request, context: Context) {
  try {
    const { db, userId } = await identity(request, true);
    const { id } = await context.params;
    checkId(id);
    const input = await body(request);
    let content;
    try {
      content = parseSet(input.content);
    } catch (e) {
      throw new SetError(400, e instanceof Error ? e.message : "Invalid set.");
    }
    if (typeof input.updatedAt !== "string")
      throw new SetError(400, "Missing save version.");
    const { data, error } = await db
      .from("performance_sets")
      .update({ content, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("owner_id", userId)
      .eq("updated_at", input.updatedAt)
      .select("*")
      .maybeSingle();
    if (error) throw error;
    if (!data)
      throw new SetError(
        409,
        "This set changed in another window. Your edits are retained; reopen to compare before saving.",
      );
    return respond({ ...fromRow(data), validation: validate(data.content) });
  } catch (e) {
    return failure(e);
  }
}
export async function DELETE(request: Request, context: Context) {
  try {
    const { db, userId } = await identity(request, true);
    const { id } = await context.params;
    checkId(id);
    const { error } = await db
      .from("performance_sets")
      .delete()
      .eq("id", id)
      .eq("owner_id", userId);
    if (error) throw error;
    return respond({ ok: true });
  } catch (e) {
    return failure(e);
  }
}
