import "server-only";
import { randomUUID } from "node:crypto";
import { after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiHost, projects, analyticsEnvironment } from "./config";
import { cleanProperties, type AnalyticsEvent } from "./events";

export const receiptCookie = "visamp_analytics_receipt";
type Json = import("@/lib/supabase/database.types").Json;
// Isolate the new RPC signature until the next full database type generation.
export async function analyticsRpc(
  action: string,
  input: Record<string, Json> = {},
) {
  const db = createAdminClient() as unknown as {
    rpc(
      name: "analytics_manage",
      args: { p_action: string; p_input: Json },
    ): Promise<{ data: Json; error: unknown }>;
  };
  const query = db.rpc("analytics_manage", {
    p_action: action,
    p_input: input,
  }) as ReturnType<typeof db.rpc> & {
    abortSignal?: (signal: AbortSignal) => ReturnType<typeof db.rpc>;
  };
  const { data, error } = await (query.abortSignal
    ? query.abortSignal(AbortSignal.timeout(2000))
    : query);
  if (error) throw new Error("Analytics storage unavailable");
  return data;
}
export function receiptFromRequest(request: Request): string | null {
  const value = request.headers
    .get("cookie")
    ?.split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith(receiptCookie + "="))
    ?.slice(receiptCookie.length + 1);
  return value && /^[a-f\d-]{36}$/i.test(value) ? value : null;
}
async function validReceipt(request: Request) {
  const receipt = receiptFromRequest(request);
  if (!receipt) return null;
  const context = (await analyticsRpc("active", { receipt })) as {
    environment?: string;
  } | null;
  if (!context) return null;
  // A production receipt copied into local/test traffic cannot reach production.
  const maximum = analyticsEnvironment(
    process.env.VERCEL_ENV,
    new URL(request.url).hostname,
  );
  if (context.environment === "production" && maximum !== "production")
    return null;
  return receipt;
}
export async function registerOperation(
  request: Request,
  userId: string,
  id: string,
  kind: "generation" | "upload" | "purchase",
  mode?: string,
) {
  try {
    const receipt = await validReceipt(request);
    if (!receipt) return;
    await analyticsRpc("operation", {
      id,
      receipt,
      user_id: userId,
      kind,
      mode: mode ?? null,
    });
  } catch {
    console.warn("Analytics operation could not be recorded");
  }
}
export async function serverEvent(
  request: Request,
  userId: string,
  event: AnalyticsEvent,
  properties: Record<string, unknown> = {},
  id: string = randomUUID(),
) {
  try {
    const receipt = await validReceipt(request);
    if (!receipt) return;
    await analyticsRpc("enqueue", {
      id,
      receipt,
      user_id: userId,
      event,
      properties: cleanProperties(event, properties),
    });
    scheduleAnalyticsFlush();
  } catch {
    console.warn("Analytics event could not be recorded");
  }
}
export function scheduleAnalyticsFlush() {
  try {
    after(async () => {
      await flushAnalytics().catch(() =>
        console.warn("Analytics delivery deferred"),
      );
    });
  } catch {
    /* Cron will deliver durable pending outcomes. */
  }
}
export async function flushAnalytics() {
  await analyticsRpc("reconcile");
  const events = (await analyticsRpc("pending")) as unknown as Array<{
    id: string;
    receipt: string;
    user_id: string;
    event: AnalyticsEvent;
    properties: Record<string, unknown>;
    occurred_at: string;
    environment: keyof typeof projects;
  }>;
  let delivered = 0;
  for (const event of events) {
    // Check immediately before sending, so a withdrawn receipt cancels queued work.
    if (!(await analyticsRpc("active", { receipt: event.receipt }))) continue;
    if (!(event.environment in projects)) continue;
    if (
      event.environment === "production" &&
      process.env.VERCEL_ENV !== "production"
    )
      continue;
    const response = await fetch(`${apiHost}/track?verbose=1&ip=0`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify([
        {
          event: event.event,
          properties: {
            ...cleanProperties(event.event, event.properties),
            token: projects[event.environment],
            distinct_id: event.user_id,
            $user_id: event.user_id,
            $insert_id: event.id,
            time: Date.parse(event.occurred_at) / 1000,
            schema_version: 1,
            environment: event.environment,
            release: process.env.VERCEL_GIT_COMMIT_SHA ?? "local",
          },
        },
      ]),
      signal: AbortSignal.timeout(5000),
    });
    const result = (await response.json()) as { status?: number };
    if (!response.ok || result.status !== 1)
      throw new Error("Analytics ingestion failed");
    await analyticsRpc("delivered", { id: event.id });
    delivered++;
  }
  return delivered;
}
