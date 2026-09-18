import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ select: vi.fn(), eq: vi.fn() }));
vi.mock("@/lib/store/session", () => ({
  useSessionStore: Object.assign(
    (select: (s: unknown) => unknown) => select({ current: { id: "current" } }),
    { getState: () => ({ select: mocks.select }) },
  ),
}));
vi.mock("./tiles", () => ({
  VisTile: ({
    vis,
    onSelect,
  }: {
    vis: { title: string };
    onSelect: () => void;
  }) => <button onClick={onSelect}>{vis.title}</button>,
}));
vi.mock("./virtual-list", () => ({
  VirtualList: ({
    items,
    renderRow,
  }: {
    items: { id: string }[];
    renderRow: (v: unknown) => unknown;
  }) => (
    <div>
      {items.map((v) => (
        <div key={v.id}>{renderRow(v) as React.ReactNode}</div>
      ))}
    </div>
  ),
}));
vi.mock("@/lib/visualisations", () => ({
  creatorFromProfile: () => ({ username: "artist" }),
  visualisationFromRow: (row: unknown) => row,
}));
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    from: (table: string) => {
      const result = {
        data:
          table === "playlists"
            ? [{ id: "playlist", title: "Night visuals" }]
            : [
                { visualisations: { id: "one", title: "First visual" } },
                { visualisations: null },
                { visualisations: { id: "two", title: "Second visual" } },
              ],
        error: null,
      };
      const query = {
        select: () => query,
        eq: (...args: unknown[]) => {
          mocks.eq(...args);
          return query;
        },
        order: () => query,
        limit: () => Promise.resolve(result),
        range: () => Promise.resolve(result),
      };
      return query;
    },
  }),
}));
import { VisualPlaylists } from "./visual-playlists";
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
it("opens an owned playlist and selects a visual with its playable playlist context", async () => {
  render(<VisualPlaylists userId="owner" query="" />);
  fireEvent.click(await screen.findByRole("button", { name: "Night visuals" }));
  fireEvent.click(await screen.findByRole("button", { name: "Second visual" }));
  expect(mocks.eq).toHaveBeenCalledWith("owner_id", "owner");
  expect(mocks.select).toHaveBeenCalledWith(
    { id: "two", title: "Second visual" },
    [
      { id: "one", title: "First visual" },
      { id: "two", title: "Second visual" },
    ],
  );
  fireEvent.click(screen.getByRole("button", { name: "← Playlists" }));
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Night visuals" })).toBeTruthy(),
  );
});
