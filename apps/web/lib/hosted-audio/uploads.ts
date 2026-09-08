import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { AdminAuthorizationError } from "./admin";
export { readUploadDetails, uploadLicenceValid } from "./upload-rules";

export async function uploadIdentity() {
  const session = await createClient();
  const { data, error } = await session.auth.getUser();
  if (error || !data.user)
    throw new AdminAuthorizationError(401, "Sign in to upload music.");
  const db = createAdminClient();
  const membership = await db
    .from("app_admins")
    .select("user_id")
    .eq("user_id", data.user.id)
    .maybeSingle();
  if (membership.error) throw new Error("Upload access is unavailable.");
  return { userId: data.user.id, admin: !!membership.data, db };
}
export function sameOrigin(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin)
    throw new AdminAuthorizationError(403, "Invalid request origin.");
}

export function uploadError(error: unknown) {
  if (error instanceof AdminAuthorizationError)
    return Response.json({ error: error.message }, { status: error.status });
  return Response.json(
    { error: "Uploads are unavailable. Please try again later." },
    { status: 503 },
  );
}
