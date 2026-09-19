import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
const signOut = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ usePathname: () => "/settings" }));
vi.mock("@/components/auth/auth-provider", () => ({ useAuth: () => ({ user: { id: "owner" }, profile: { username: "nova" }, loading: false, needsUsername: false, signOut }) }));
vi.mock("@/components/auth/sign-in-dialog", () => ({ SignInDialog: () => null }));
vi.mock("@/components/auth/username-claim-dialog", () => ({ UsernameClaimDialog: () => null }));
vi.mock("@/lib/storage-urls", () => ({ profileAvatarUrl: () => undefined }));
import { AccountMenu } from "./account-menu";
afterEach(cleanup);
it("uses the avatar as a menu button without a nested navigation link", () => {
  render(<AccountMenu />);
  const trigger = screen.getByRole("button", { name: "Open account menu" });
  expect(trigger.querySelector("a")).toBeNull();
  expect(trigger.getAttribute("aria-haspopup")).toBe("menu");
});
