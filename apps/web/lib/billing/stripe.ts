import "server-only";
import Stripe from "stripe";

export function stripeClient() {
  if (!process.env.STRIPE_SECRET_KEY)
    throw new Error("Credit purchases are not configured");
  const live = stripeLiveMode();
  if (
    !process.env.STRIPE_SECRET_KEY.startsWith(live ? "sk_live_" : "sk_test_")
  ) {
    throw new Error("Stripe key does not match STRIPE_MODE");
  }
  return new Stripe(process.env.STRIPE_SECRET_KEY);
}
export function stripeLiveMode() {
  const mode = process.env.STRIPE_MODE;
  if (mode !== "test" && mode !== "live")
    throw new Error("STRIPE_MODE must be test or live");
  if (process.env.VERCEL_ENV === "production" && mode !== "live")
    throw new Error("Test payments cannot fund production credits");
  return mode === "live";
}
