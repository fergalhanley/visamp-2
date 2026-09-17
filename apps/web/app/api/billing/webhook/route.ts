import { stripeClient, stripeLiveMode } from "@/lib/billing/stripe";
import { fulfillCreditEvent } from "@/lib/billing/webhook";

export const runtime = "nodejs";
export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret)
    return Response.json({ error: "Webhook unavailable" }, { status: 503 });
  if (!signature)
    return Response.json({ error: "Missing signature" }, { status: 400 });
  let stripe;
  try {
    stripe = stripeClient();
  } catch {
    return Response.json(
      { error: "Webhook configuration unavailable" },
      { status: 503 },
    );
  }
  const body = await request.text();
  let event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, secret);
  } catch {
    return Response.json({ error: "Invalid signature" }, { status: 400 });
  }
  try {
    await fulfillCreditEvent(event, stripeLiveMode());
    return Response.json({ received: true });
  } catch (error) {
    console.error(
      "Credit webhook failed",
      event.id,
      error instanceof Error ? error.message : "Database error",
    );
    return Response.json(
      { error: "Fulfilment failed; retry event" },
      { status: 500 },
    );
  }
}
