import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
const auth = vi.hoisted(() => ({
  user: null as null | { id: string },
  loading: false,
}));
const route = vi.hoisted(() => ({
  path: "/vj-mode",
  query: "set=private-set",
}));
vi.mock("@/components/auth/auth-provider", () => ({ useAuth: () => auth }));
vi.mock("next/navigation", () => ({
  usePathname: () => route.path,
  useSearchParams: () => new URLSearchParams(route.query),
}));
vi.mock("@/components/auth/sign-in-dialog", () => ({
  SignInDialog: ({ open, next }: { open: boolean; next: string }) =>
    open ? (
      <div role="dialog" data-next={next}>
        Sign in
      </div>
    ) : null,
}));
import { SetAccess } from "./access";
import { SetNav } from "./nav";
afterEach(() => {
  cleanup();
  auth.user = null;
  route.path = "/vj-mode";
  route.query = "set=private-set";
});
it("preserves the exact protected route and set query across sign-in", () => {
  render(
    <SetAccess>
      <p>Private programme</p>
    </SetAccess>,
  );
  expect(screen.queryByText("Private programme")).toBeNull();
  expect(screen.getByRole("dialog").getAttribute("data-next")).toBe(
    "/vj-mode?set=private-set",
  );
});
it("renders owner controls after authentication", () => {
  auth.user = { id: "owner" };
  render(
    <SetAccess>
      <p>Private programme</p>
    </SetAccess>,
  );
  expect(screen.getByText("Private programme")).toBeTruthy();
  expect(screen.queryByRole("dialog")).toBeNull();
});
it("signed-out navigation requests sign-in with the VJ destination", () => {
  route.path = "/player";
  render(<SetNav />);
  expect(screen.queryByText("Set Builder")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "VJ Mode" }));
  expect(screen.getByRole("dialog").getAttribute("data-next")).toBe("/vj-mode");
});
it("shows the Set Builder editor entry only for signed-in users", () => {
  auth.user = { id: "owner" };
  route.path = "/edit";
  render(<SetNav />);
  expect(
    screen.getByRole("link", { name: "Set Builder" }).getAttribute("href"),
  ).toBe("/sets");
});

it("hides the VJ action on its own page and provides Set Builder", () => {
  auth.user = { id: "owner" };
  render(<SetNav />);
  expect(screen.queryByRole("link", { name: "VJ Mode" })).toBeNull();
  expect(screen.getByRole("link", { name: "Set Builder" }).getAttribute("href")).toBe("/sets");
});
