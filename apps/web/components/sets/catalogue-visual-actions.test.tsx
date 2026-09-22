import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ read: vi.fn(), insert: vi.fn() }));
vi.mock("@/components/auth/auth-provider", () => ({
  useAuth: () => ({ user: { id: "owner" } }),
}));
vi.mock("@/lib/analytics/client", () => ({ track: vi.fn() }));
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: m.read }) }),
      insert: m.insert,
    }),
  }),
}));
import { CatalogueVisualActions } from "./catalogue-visual-actions";
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
it("only offers editing to the owner and targets that visualisation", () => {
  const view = render(<CatalogueVisualActions id="visual" ownerId="owner" />);
  expect(screen.getByRole("link", { name: "Edit" }).getAttribute("href")).toBe(
    "/edit/visual",
  );
  view.rerender(<CatalogueVisualActions id="visual" ownerId="someone-else" />);
  expect(screen.queryByRole("link", { name: "Edit" })).toBeNull();
  expect(screen.getByRole("button", { name: "Fork" })).toBeTruthy();
});
it("does not fork unrelated player content when the selected visual is unavailable", async () => {
  m.read.mockResolvedValue({ data: null, error: null });
  render(<CatalogueVisualActions id="missing" ownerId="other" />);
  fireEvent.click(screen.getByRole("button", { name: "Fork" }));
  await waitFor(() =>
    expect(screen.getByRole("alert").textContent).toContain(
      "no longer available",
    ),
  );
  expect(m.insert).not.toHaveBeenCalled();
});
it("copies the selected source into a private fork with attribution", async () => {
  m.read.mockResolvedValue({
    data: { source: "selected source", description: "Description" },
    error: null,
  });
  m.insert.mockReturnValue({
    select: () => ({
      single: async () => ({ error: new Error("Save failed") }),
    }),
  });
  render(<CatalogueVisualActions id="selected" ownerId="other" />);
  fireEvent.click(screen.getByRole("button", { name: "Fork" }));
  await waitFor(() =>
    expect(m.insert).toHaveBeenCalledWith({
      owner_id: "owner",
      source: "selected source",
      description: "Description",
      visibility: "private",
      forked_from_id: "selected",
    }),
  );
  expect(await screen.findByRole("alert")).toBeTruthy();
});
