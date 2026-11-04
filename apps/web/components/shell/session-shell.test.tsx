import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
const route = vi.hoisted(() => ({ pathname: "/embed" }));
vi.mock("next/navigation", () => ({ usePathname: () => route.pathname }));
vi.mock("next/dynamic", () => ({
  default:
    () =>
    ({ children }: { children: ReactNode }) => (
      <div data-testid="app-session">{children}</div>
    ),
}));
import { SessionShell } from "./session-shell";
afterEach(cleanup);
it("omits the account/audio/analytics shell on embed routes while preserving it for the app", () => {
  const view = render(<SessionShell>Example</SessionShell>);
  expect(screen.queryByTestId("app-session")).toBeNull();
  expect(screen.getByText("Example")).toBeTruthy();
  route.pathname = "/player";
  view.rerender(<SessionShell>Example</SessionShell>);
  expect(screen.getByTestId("app-session")).toBeTruthy();
});
