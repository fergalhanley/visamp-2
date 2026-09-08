import "server-only";

import { createHmac, randomUUID } from "node:crypto";

import { createAdminClient } from "@/lib/supabase/admin";

type AdmissionReason =
  "allowed" | "concurrency" | "user_rate" | "ip_rate" | "insufficient_credit";
type CompletionStatus = "success" | "exhausted" | "error" | "aborted";

export interface AiGenerationAdmission {
  allowed: boolean;
  requestId: string;
  reason?: Exclude<AdmissionReason, "allowed">;
  retryAfterSeconds: number;
}

function boundedInteger(
  name: string,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const configured = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(configured)) return fallback;
  return Math.min(maximum, Math.max(minimum, configured));
}

function clientAddress(request: Request): string {
  // x-real-ip is expected to be overwritten by the trusted deployment proxy.
  // The rightmost forwarded address is the direct peer added by the last proxy;
  // taking the first value would trust a client-controlled prefix.
  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",").at(-1)?.trim() || "unknown";
}

export function aiGenerationEnabled(): boolean {
  return process.env.AI_GENERATION_ENABLED === "true";
}

export async function admitAiGeneration(
  request: Request,
  userId: string,
): Promise<AiGenerationAdmission> {
  const hmacKey = process.env.AI_ABUSE_HMAC_KEY;
  if (!hmacKey || hmacKey.length < 32) {
    throw new Error("AI abuse-control hashing is not configured");
  }

  const requestId = randomUUID();
  const ipHash = createHmac("sha256", hmacKey)
    .update(clientAddress(request))
    .digest("hex");
  const windowSeconds = boundedInteger(
    "AI_RATE_WINDOW_SECONDS",
    3600,
    60,
    86400,
  );
  const { data, error } = await createAdminClient().rpc("begin_ai_generation", {
    p_request_id: requestId,
    p_user_id: userId,
    p_ip_hash: ipHash,
    p_user_limit: boundedInteger("AI_RATE_LIMIT_PER_USER", 10, 1, 1000),
    p_ip_limit: boundedInteger("AI_RATE_LIMIT_PER_IP", 30, 1, 5000),
    p_window_seconds: windowSeconds,
    p_concurrent_limit: boundedInteger(
      "AI_CONCURRENT_LIMIT_PER_USER",
      2,
      1,
      10,
    ),
  });
  if (error)
    throw new Error(`Could not enforce AI request limits: ${error.message}`);

  const reason = data as AdmissionReason;
  if (
    ![
      "allowed",
      "concurrency",
      "user_rate",
      "ip_rate",
      "insufficient_credit",
    ].includes(reason)
  ) {
    throw new Error("AI request admission returned an invalid result");
  }
  return {
    allowed: reason === "allowed",
    requestId,
    reason: reason === "allowed" ? undefined : reason,
    retryAfterSeconds: reason === "concurrency" ? 15 : windowSeconds,
  };
}

export async function completeAiGeneration(
  requestId: string,
  status: CompletionStatus,
  attempts: number,
): Promise<void> {
  const { data, error } = await createAdminClient().rpc(
    "complete_ai_generation",
    {
      p_request_id: requestId,
      p_status: status,
      p_attempts: attempts,
    },
  );
  if (error)
    throw new Error(`Could not complete AI request record: ${error.message}`);
  if (data !== true)
    throw new Error("AI request was no longer active at completion");
}
