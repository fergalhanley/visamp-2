import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ path: "/player", choice: null as string | null, save: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: () => state.path }));
vi.mock("@/components/auth/auth-provider", () => ({ useAuth: () => ({ user: null, loading: false }) }));
vi.mock("@/lib/analytics/playback", () => ({ observePlayback: () => () => {} }));
vi.mock("@/lib/analytics/client", () => ({
  consent: () => state.choice, consentKey: "consent", identifyAnalytics: vi.fn(), pageViewed: vi.fn(),
  setAnalyticsConsent: (accepted: boolean) => { state.save(accepted); state.choice = accepted ? "accepted" : "declined"; window.dispatchEvent(new Event("visamp:analytics-consent")); return Promise.resolve(true); },
}));
import { AnalyticsProvider } from "./analytics-provider";
beforeEach(() => { state.path = "/player"; state.choice = null; state.save.mockClear(); });
afterEach(cleanup);
it("retains first-visit consent and links later preference changes to Settings", async () => {
  render(<AnalyticsProvider />);
  expect(screen.getByRole("link", { name: "Settings" }).getAttribute("href")).toBe("/settings");
  fireEvent.click(screen.getByRole("button", { name: "Decline analytics" }));
  await waitFor(() => expect(screen.queryByRole("region")).toBeNull());
  expect(state.save).toHaveBeenCalledWith(false);
});
it("does not overlay the settings page with a first-visit banner", () => {
  state.path = "/settings";
  render(<AnalyticsProvider />);
  expect(screen.queryByRole("region")).toBeNull();
  expect(state.save).not.toHaveBeenCalled();
});
it("keeps captured VJ output clean without implicitly accepting analytics", () => {
  state.path = "/vj-mode/output/session";
  render(<AnalyticsProvider />);
  expect(screen.queryByRole("region")).toBeNull();
  expect(state.save).not.toHaveBeenCalled();
});
