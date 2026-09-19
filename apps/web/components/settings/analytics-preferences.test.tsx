// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AnalyticsPreferences } from "./analytics-preferences";

const state = vi.hoisted(() => ({ choice: null as string | null, save: vi.fn() }));
vi.mock("@/lib/analytics/client", () => ({
  consent: () => state.choice,
  setAnalyticsConsent: (accepted: boolean) => {
    state.choice = accepted ? "accepted" : "declined";
    window.dispatchEvent(new Event("visamp:analytics-consent"));
    return state.save(accepted);
  },
}));

beforeEach(() => {
  state.choice = null;
  state.save.mockReset().mockResolvedValue(true);
});
afterEach(cleanup);

it("starts off without granting consent and supports enabling and withdrawing", async () => {
  render(<AnalyticsPreferences />);
  const toggle = screen.getByRole("switch", { name: "Usage analytics" }) as HTMLInputElement;
  expect(toggle.checked).toBe(false);
  expect(state.save).not.toHaveBeenCalled();
  fireEvent.click(toggle);
  await waitFor(() => expect(toggle.disabled).toBe(false));
  expect(state.save).toHaveBeenLastCalledWith(true);
  expect(toggle.checked).toBe(true);
  fireEvent.click(toggle);
  await waitFor(() => expect(toggle.disabled).toBe(false));
  expect(state.save).toHaveBeenLastCalledWith(false);
  expect(toggle.checked).toBe(false);
});

it("retains the withdrawal on server failure and retries that same choice", async () => {
  state.choice = "accepted";
  state.save.mockResolvedValueOnce(false);
  render(<AnalyticsPreferences />);
  const toggle = screen.getByRole("switch") as HTMLInputElement;
  fireEvent.click(toggle);
  await screen.findByRole("alert");
  expect(toggle.checked).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  expect(state.save.mock.calls).toEqual([[false], [false]]);
});

it("reflects choices from the first-visit prompt and other tabs", () => {
  render(<AnalyticsPreferences />);
  const toggle = screen.getByRole("switch") as HTMLInputElement;
  act(() => {
    state.choice = "accepted";
    window.dispatchEvent(new Event("visamp:analytics-consent"));
  });
  expect(toggle.checked).toBe(true);
  act(() => {
    state.choice = "declined";
    window.dispatchEvent(new Event("storage"));
  });
  expect(toggle.checked).toBe(false);
});
