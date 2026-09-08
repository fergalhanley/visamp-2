import "server-only";

import { createClient as createSessionClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export class AdminAuthorizationError extends Error {
  constructor(
    readonly status: 401 | 403,
    message: string,
  ) {
    super(message);
  }
}

export async function requireAdmin(): Promise<{ userId: string }> {
  const session = await createSessionClient();
  const { data, error } = await session.auth.getUser();
  if (error || !data.user)
    throw new AdminAuthorizationError(401, "Sign in required");

  const { data: membership, error: membershipError } = await createAdminClient()
    .from("app_admins")
    .select("user_id")
    .eq("user_id", data.user.id)
    .maybeSingle();
  if (membershipError)
    throw new Error(
      `Could not verify admin access: ${membershipError.message}`,
    );
  if (!membership)
    throw new AdminAuthorizationError(403, "Admin access required");
  return { userId: data.user.id };
}
