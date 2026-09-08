import "server-only";

import { createHmac } from "node:crypto";

import { createAdminClient } from "@/lib/supabase/admin";

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
  configured: boolean;
}

function clientAddress(request: Request): string {
  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;
  return (
    request.headers.get("x-forwarded-for")?.split(",").at(-1)?.trim() ||
    "unknown"
  );
}

/** Durable per-network fixed-window admission for public server endpoints. */
export async function checkApiRateLimit(
  request: Request,
  bucket: string,
  limit: number,
  windowMs: number,
): Promise<RateLimitResult> {
  const secret = process.env.API_RATE_LIMIT_HMAC_KEY;
  if (!secret || secret.length < 32) {
    return { allowed: false, retryAfterSeconds: 60, configured: false };
  }

  const identityHash = createHmac("sha256", secret)
    .update(clientAddress(request))
    .digest("hex");
  const windowSeconds = Math.max(1, Math.ceil(windowMs / 1000));
  const { data, error } = await createAdminClient().rpc(
    "consume_api_rate_limit",
    {
      p_bucket: bucket,
      p_identity_hash: identityHash,
      p_limit: limit,
      p_window_seconds: windowSeconds,
    },
  );

  if (error || typeof data !== "number") {
    return { allowed: false, retryAfterSeconds: 60, configured: false };
  }
  return {
    allowed: data === 0,
    retryAfterSeconds: data === 0 ? windowSeconds : data,
    configured: true,
  };
}
