import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
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
  vi.unstubAllGlobals();
});
it("shows presets and quotes custom purchases with a $2 minimum", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValue({ ok: true, json: async () => summary });
  vi.stubGlobal("fetch", fetch);
  render(<CreditPanel />);
  await screen.findByText("500 available credits");
  fireEvent.click(screen.getByRole("button", { name: "US$20 2,000 credits" }));
  expect(
    screen.getByText("2,000 credits — 20 successful requests"),
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
  expect(screen.getByText("201 credits — 2 successful requests")).toBeTruthy();
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
