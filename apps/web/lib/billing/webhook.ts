import { scheduleAnalyticsFlush } from "@/lib/analytics/server";
import "server-only";
import type Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";

export async function fulfillCreditEvent(
  event: Stripe.Event,
  liveMode: boolean,
) {
  if (event.livemode !== liveMode)
    throw new Error("Stripe event mode mismatch");
  const db = createAdminClient();
  if (
    event.type === "checkout.session.completed" ||
    event.type === "checkout.session.async_payment_succeeded"
  ) {
    const session = event.data.object;
    if (session.mode !== "payment" || session.payment_status !== "paid") return;
    const purchaseId = session.metadata?.purchase_id;
    if (!purchaseId) return; // Other products may share this Stripe account.
    const intent =
      typeof session.payment_intent === "string"
        ? session.payment_intent
        : session.payment_intent?.id;
    if (!intent || session.amount_subtotal === null || !session.currency)
      throw new Error("Incomplete credit payment");
    const result = await db.rpc("fulfill_ai_credit_purchase", {
      p_purchase_id: purchaseId,
      p_session_id: session.id,
      p_payment_intent_id: intent,
      p_amount_cents: session.amount_subtotal,
      p_currency: session.currency,
      p_livemode: session.livemode,
    });
    if (result.error) throw result.error;
    scheduleAnalyticsFlush();
  } else if (event.type === "charge.refunded") {
    const charge = event.data.object;
    if (!charge.metadata.purchase_id) return;
    const intent =
      typeof charge.payment_intent === "string"
        ? charge.payment_intent
        : charge.payment_intent?.id;
    if (!intent) throw new Error("Missing refund payment intent");
    const result = await db.rpc("refund_ai_credit_purchase", {
      p_payment_intent_id: intent,
      p_refunded_cents: charge.amount_refunded,
      p_paid_cents: charge.amount,
      p_livemode: charge.livemode,
    });
    if (result.error) throw result.error;
  }
}
