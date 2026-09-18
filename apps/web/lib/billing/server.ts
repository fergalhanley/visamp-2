import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export async function creditSummary(userId: string) {
  const db = createAdminClient();
  const [balance, profile, settings, allocations, purchases, usage] =
    await Promise.all([
      db.rpc("ai_available_credits", { p_user_id: userId }),
      db.from("profiles").select("ai_credit_exempt").eq("id", userId).single(),
      db
        .from("ai_credit_settings")
        .select("generation_cost")
        .eq("singleton", true)
        .single(),
      db
        .from("ai_credit_allocations")
        .select("id, source, amount, remaining, expires_at, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(100),
      db
        .from("ai_credit_purchases")
        .select(
          "id, amount_cents, credits, paid_at, refunded_cents, created_at",
        )
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(50),
      db
        .from("ai_generation_requests")
        .select("id, status, credit_cost, created_at, has_source, repair_charged")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(50),
    ]);
  if (
    [balance, profile, settings, allocations, purchases, usage].some(
      (r) => r.error,
    )
  ) {
    throw new Error("Credit information is temporarily unavailable");
  }
  return {
    asOf: new Date().toISOString(),
    available: Number(balance.data),
    exempt: profile.data!.ai_credit_exempt,
    generationCost: settings.data!.generation_cost,
    allocations: allocations.data!,
    purchases: purchases.data!,
    usage: usage.data!,
  };
}
export type CreditSummary = Awaited<ReturnType<typeof creditSummary>>;
