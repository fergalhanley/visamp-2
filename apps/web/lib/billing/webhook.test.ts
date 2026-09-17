// @vitest-environment node
import Stripe from "stripe";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const rpc = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ rpc }) }));
import { POST } from "@/app/api/billing/webhook/route";
import { fulfillCreditEvent } from "./webhook";
const stripe = new Stripe("sk_test_fake");
const session = {
  id: "cs_test",
  mode: "payment",
  payment_status: "paid",
  currency: "usd",
  amount_subtotal: 500,
  payment_intent: "pi_test",
  metadata: { purchase_id: "purchase-1" },
  livemode: false,
};
function event(type = "checkout.session.completed", object = session) {
  return {
    id: "evt_test",
    type,
    data: { object },
    livemode: false,
  } as unknown as Stripe.Event;
}
beforeEach(() => {
  rpc.mockReset().mockResolvedValue({ data: true, error: null });
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_fake");
  vi.stubEnv("STRIPE_MODE", "test");
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_test");
  vi.stubEnv("VERCEL_ENV", "development");
});
afterEach(() => vi.unstubAllEnvs());
it("requires a valid signature before allocation", async () => {
  const r = await POST(
    new Request("http://localhost/api/billing/webhook", {
      method: "POST",
      body: JSON.stringify(event()),
      headers: { "stripe-signature": "invalid" },
    }),
  );
  expect(r.status).toBe(400);
  expect(rpc).not.toHaveBeenCalled();
});
it("verifies signed payment and delegates idempotency to atomic DB fulfilment", async () => {
  const payload = JSON.stringify(event());
  const signature = stripe.webhooks.generateTestHeaderString({
    payload,
    secret: "whsec_test",
  });
  const r = await POST(
    new Request("http://localhost/api/billing/webhook", {
      method: "POST",
      body: payload,
      headers: { "stripe-signature": signature },
    }),
  );
  expect(r.status).toBe(200);
  expect(rpc).toHaveBeenCalledWith(
    "fulfill_ai_credit_purchase",
    expect.objectContaining({
      p_amount_cents: 500,
      p_currency: "usd",
      p_purchase_id: "purchase-1",
    }),
  );
});
it("does not allocate unpaid checkouts or cross-mode events", async () => {
  await fulfillCreditEvent(
    event("checkout.session.completed", {
      ...session,
      payment_status: "unpaid",
    }),
    false,
  );
  await expect(fulfillCreditEvent(event(), true)).rejects.toThrow(
    "mode mismatch",
  );
  expect(rpc).not.toHaveBeenCalled();
});
it("retries database failures instead of acknowledging lost credits", async () => {
  rpc.mockResolvedValue({ error: { message: "database unavailable" } });
  const payload = JSON.stringify(event());
  const signature = stripe.webhooks.generateTestHeaderString({
    payload,
    secret: "whsec_test",
  });
  const r = await POST(
    new Request("http://localhost/api/billing/webhook", {
      method: "POST",
      body: payload,
      headers: { "stripe-signature": signature },
    }),
  );
  expect(r.status).toBe(500);
});
it("rejects test payments on production", async () => {
  vi.stubEnv("VERCEL_ENV", "production");
  const payload = JSON.stringify(event());
  const signature = stripe.webhooks.generateTestHeaderString({
    payload,
    secret: "whsec_test",
  });
  const r = await POST(
    new Request("http://localhost/api/billing/webhook", {
      method: "POST",
      body: payload,
      headers: { "stripe-signature": signature },
    }),
  );
  expect(r.status).toBe(503);
  expect(rpc).not.toHaveBeenCalled();
});
