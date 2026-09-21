import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkApiRateLimit } from "@/lib/rate-limit";
export class SetError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function identity(request: Request, mutation = false) {
  const rate = await checkApiRateLimit(request, "sets", 180, 60000);
  if (!rate.allowed)
    throw new SetError(
      rate.configured ? 429 : 503,
      "Sets are temporarily unavailable.",
    );
  if (mutation && request.headers.get("origin") !== new URL(request.url).origin)
    throw new SetError(403, "Invalid origin.");
  const { data, error } = await (await createClient()).auth.getUser();
  if (error || !data.user) throw new SetError(401, "Sign in to use sets.");
  return { db: createAdminClient(), userId: data.user.id };
}
export async function body(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) throw new SetError(400, "Missing set.");
  let size = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    size += part.value.byteLength;
    if (size > 2097152) {
      await reader.cancel();
      throw new SetError(413, "Set is too large.");
    }
    chunks.push(part.value);
  }
  try {
    const parsed = JSON.parse(Buffer.concat(chunks).toString());
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      throw new Error();
    return parsed as Record<string, unknown>;
  } catch {
    throw new SetError(400, "Invalid JSON.");
  }
}
export const respond = (data: unknown, status = 200) =>
  Response.json(data, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
export function failure(e: unknown) {
  if (e instanceof SetError) return respond({ error: e.message }, e.status);
  console.error("[sets]", e);
  return respond({ error: "Could not save or load sets. Please retry." }, 503);
}
export function checkId(id: string) {
  if (!/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(id))
    throw new SetError(404, "Set not found.");
}
