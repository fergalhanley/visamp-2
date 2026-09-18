import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { AccountCreditRow } from "./account-credit-row";
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("shows the available balance and refreshes after returning from billing", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(Response.json({ available: 2000 }))
    .mockResolvedValueOnce(Response.json({ available: 7000 }));
  vi.stubGlobal("fetch", fetch);
  render(<AccountCreditRow />);
  expect(screen.getByText("Loading credits…")).toBeTruthy();
  await screen.findByText("2,000 credits");
  expect(
    screen
      .getByRole("link", { name: "Credits & billing" })
      .getAttribute("href"),
  ).toBe("/account/billing");
  fireEvent.focus(window);
  await screen.findByText("7,000 credits");
});
it("keeps billing available when the balance cannot load", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(Response.json({}, { status: 503 })),
  );
  render(<AccountCreditRow />);
  await screen.findByText("Credits unavailable");
  expect(screen.getByRole("link", { name: "Credits & billing" })).toBeTruthy();
  expect(screen.queryByText("0 credits")).toBeNull();
});
