import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
const navigation = vi.hoisted(() => ({ search: "" }));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(navigation.search),
}));
import { CreditPanel } from "./credit-panel";
const summary = {
  available: 500,
  exempt: false,
  generationCost: 100,
  allocations: [],
  purchases: [],
  usage: [],
};
afterEach(() => {
  cleanup();
  navigation.search = "";
  window.history.replaceState(null, "", "/");
  vi.unstubAllGlobals();
});
it("shows presets and quotes custom purchases with a $2 minimum", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValue({ ok: true, json: async () => summary });
  vi.stubGlobal("fetch", fetch);
  render(<CreditPanel />);
  await screen.findByText("500 available credits");
  fireEvent.click(screen.getByRole("button", { name: "US$20 20,000 credits" }));
  expect(
    screen.getByText("20,000 credits — 200 successful requests"),
  ).toBeTruthy();
  fireEvent.change(screen.getByLabelText("Custom amount (USD)"), {
    target: { value: "1.99" },
  });
  expect(
    (
      screen.getByRole("button", {
        name: "Continue to secure checkout",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  fireEvent.change(screen.getByLabelText("Custom amount (USD)"), {
    target: { value: "2.01" },
  });
  expect(
    screen.getByText("2,010 credits — 20 successful requests"),
  ).toBeTruthy();
  fetch.mockResolvedValue({
    ok: false,
    json: async () => ({ error: "Checkout unavailable" }),
  });
  fireEvent.click(
    screen.getByRole("button", { name: "Continue to secure checkout" }),
  );
  await screen.findByRole("alert");
  expect(fetch).toHaveBeenLastCalledWith(
    "/api/billing/checkout",
    expect.objectContaining({ body: JSON.stringify({ amount: "2.01" }) }),
  );
  await waitFor(() =>
    expect(
      (
        screen.getByRole("button", {
          name: "Continue to secure checkout",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false),
  );
});

it("replaces checkout with verified purchase details and restores it on Buy More Credits", async () => {
  navigation.search = "purchase=confirmed";
  window.history.replaceState(null, "", "/account/billing?purchase=confirmed");
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ...summary,
        available: 7000,
        purchases: [
          {
            id: "confirmed",
            credits: 5000,
            amount_cents: 500,
            paid_at: "2026-09-17T09:00:00Z",
            created_at: "2026-09-17T09:00:00Z",
            refunded_cents: 0,
          },
        ],
      }),
    }),
  );
  render(<CreditPanel />);
  await screen.findByRole("heading", { name: "Credit purchase successful" });
  expect(
    screen.getByText("You purchased 5,000 credits for US$5.00."),
  ).toBeTruthy();
  expect(screen.getByText("Total available: 7,000 credits")).toBeTruthy();
  expect(
    screen.queryByRole("button", { name: "Continue to secure checkout" }),
  ).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Buy More Credits" }));
  expect(screen.getByRole("heading", { name: "Buy credits" })).toBeTruthy();
  expect(
    screen.queryByRole("heading", { name: "Credit purchase successful" }),
  ).toBeNull();
  expect(window.location.search).toBe("");
});

it("waits for the matching purchase to be paid and shows success when the balance refresh confirms it", async () => {
  navigation.search = "purchase=pending";
  const purchase = {
    id: "pending",
    credits: 5000,
    amount_cents: 500,
    paid_at: null,
    created_at: "2026-09-17T09:00:00Z",
    refunded_cents: 0,
  };
  const fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      ...summary,
      purchases: [
        purchase,
        { ...purchase, id: "other", paid_at: "2026-09-17T09:00:00Z" },
      ],
    }),
  });
  vi.stubGlobal("fetch", fetch);
  render(<CreditPanel />);
  await screen.findByText("500 available credits");
  expect(
    screen.getByRole("heading", { name: "Confirming your credit purchase" }),
  ).toBeTruthy();
  expect(
    screen.queryByRole("button", { name: "Continue to secure checkout" }),
  ).toBeNull();
  expect(screen.queryByRole("button", { name: "Buy More Credits" })).toBeNull();
  fetch.mockResolvedValue({
    ok: true,
    json: async () => ({
      ...summary,
      available: 5500,
      purchases: [{ ...purchase, paid_at: "2026-09-17T09:00:00Z" }],
    }),
  });
  fireEvent.click(screen.getByRole("button", { name: "Refresh balance" }));
  await screen.findByRole("heading", { name: "Credit purchase successful" });
  expect(screen.getByText("Total available: 5,500 credits")).toBeTruthy();
});
it("shows a failed repair as charged and a failed initial request as free", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ...summary,
        usage: [
          {
            id: "repair",
            status: "error",
            repair_charged: true,
            credit_cost: 100,
            created_at: "2026-09-18T00:00:00Z",
            has_source: false,
          },
          {
            id: "initial",
            status: "error",
            repair_charged: false,
            credit_cost: 100,
            created_at: "2026-09-18T00:00:00Z",
            has_source: false,
          },
        ],
      }),
    }),
  );
  render(<CreditPanel />);
  await screen.findByText("100 credits");
  expect(screen.getByText(/Repair · error/)).toBeTruthy();
  expect(screen.getByText("No charge")).toBeTruthy();
});
