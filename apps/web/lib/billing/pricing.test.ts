import { describe, expect, it } from "vitest";
import { creditsForCents, parsePurchaseCents } from "./pricing";

describe("USD credit quotes", () => {
  it.each([
    ["2", 200, 2000],
    ["5", 500, 5000],
    ["20", 2000, 20000],
    ["50", 5000, 50000],
    ["2.01", 201, 2010],
    ["1000", 100000, 1000000],
  ])("quotes %s exactly", (input, cents, credits) => {
    expect(parsePurchaseCents(input)).toBe(cents);
    expect(creditsForCents(cents as number)).toBe(credits);
  });
  it.each([
    "1.99",
    "1000.01",
    "-5",
    "5.001",
    "1e2",
    "NaN",
    "Infinity",
    "",
    5,
    null,
    {},
    "0xFF",
  ])("rejects invalid amount %s", (input) => {
    expect(parsePurchaseCents(input)).toBeNull();
  });
});
