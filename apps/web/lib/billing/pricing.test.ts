import { describe, expect, it } from "vitest";
import { creditsForCents, parsePurchaseCents } from "./pricing";

describe("USD credit quotes", () => {
  it.each([
    ["2", 200],
    ["5", 500],
    ["20", 2000],
    ["50", 5000],
    ["2.01", 201],
    ["1000", 100000],
  ])("quotes %s exactly", (input, cents) => {
    expect(parsePurchaseCents(input)).toBe(cents);
    expect(creditsForCents(cents as number)).toBe(cents);
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
