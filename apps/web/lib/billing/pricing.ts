export const CREDIT_PRESETS = [5, 20, 50] as const;
export const MIN_PURCHASE_CENTS = 200;
export const MAX_PURCHASE_CENTS = 100_000;
export const CREDITS_PER_USD = 1_000;

export function parsePurchaseCents(value: unknown): number | null {
  if (typeof value !== "string" || !/^\d+(\.\d{1,2})?$/.test(value))
    return null;
  const [whole, fraction = ""] = value.split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(cents) &&
    cents >= MIN_PURCHASE_CENTS &&
    cents <= MAX_PURCHASE_CENTS
    ? cents
    : null;
}
export function creditsForCents(cents: number) {
  return (cents * CREDITS_PER_USD) / 100; // Ten credits per cent, no rounding.
}
