import { randomUUID } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { stripeClient, stripeLiveMode } from "@/lib/billing/stripe";
import { creditsForCents, parsePurchaseCents } from "@/lib/billing/pricing";

export const runtime = "nodejs";
export async function POST(request: Request) {
  const origin = new URL(request.url).origin;
  if (request.headers.get("origin") !== origin)
    return Response.json({ error: "Invalid origin" }, { status: 403 });
  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user)
    return Response.json({ error: "Sign in to buy credits" }, { status: 401 });
  const body = await request.json().catch(() => null);
  const cents = parsePurchaseCents(body?.amount);
  if (cents === null)
    return Response.json(
      {
        error:
          "Enter an amount between US$2 and US$1,000, with up to two decimal places",
      },
      { status: 400 },
    );
  try {
    const stripe = stripeClient();
    const livemode = stripeLiveMode();
    const admin = createAdminClient();
    const id = randomUUID();
    const credits = creditsForCents(cents);
    const { error } = await admin
      .from("ai_credit_purchases")
      .insert({ id, user_id: user.id, amount_cents: cents, credits, livemode });
    if (error) throw error;
    const session = await stripe.checkout.sessions.create(
      {
        mode: "payment",
        payment_method_types: ["card"],
        client_reference_id: id,
        customer_email: user.email,
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: "usd",
              unit_amount: cents,
              tax_behavior: "exclusive",
              product_data: {
                name: `${credits.toLocaleString("en-US")} Visamp credits`,
              },
            },
          },
        ],
        metadata: { purchase_id: id },
        payment_intent_data: { metadata: { purchase_id: id } },
        adaptive_pricing: { enabled: false },
        automatic_tax: { enabled: process.env.STRIPE_AUTOMATIC_TAX === "true" },
        success_url: `${origin}/account/billing?purchase=${id}`,
        cancel_url: `${origin}/account/billing?cancelled=1`,
      },
      { idempotencyKey: `credit-purchase:${id}` },
    );
    if (session.livemode !== livemode || !session.url)
      throw new Error("Stripe mode mismatch");
    const saved = await admin
      .from("ai_credit_purchases")
      .update({ stripe_session_id: session.id })
      .eq("id", id);
    if (saved.error) throw saved.error;
    return Response.json({ url: session.url });
  } catch (error) {
    console.error(
      "Credit checkout failed",
      error instanceof Error ? error.message : "Database error",
    );
    return Response.json(
      {
        error: "Credit checkout is temporarily unavailable. Please try again.",
      },
      { status: 503 },
    );
  }
}
