import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { PreferredTrack } from "./preferred-track";
vi.mock("@/lib/analytics/client", () => ({ track: vi.fn() }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const song = { id: "track", title: "Song", artist: "Act" };
it("searches and pages results, then selects and clears a track", async () => {
  const fetcher = vi.fn(async (url: string) => Response.json(url.includes("offset=40")
    ? { tracks: [{ ...song, id: "later", title: "Later" }], nextOffset: null }
    : { tracks: [song], nextOffset: 40 }));
  vi.stubGlobal("fetch", fetcher);
  const change = vi.fn();
  const view = render(<PreferredTrack value={null} onChange={change} disabled={false} />);
  fireEvent.click(screen.getByRole("button", { name: /Preferred track/ }));
  fireEvent.change(await screen.findByRole("searchbox"), { target: { value: "Act" } });
  await waitFor(() => expect(fetcher).toHaveBeenCalledWith("/api/music/tracks?q=Act&offset=0", expect.anything()));
  fireEvent.click(await screen.findByRole("button", { name: "Load more" }));
  fireEvent.click(await screen.findByRole("button", { name: "Later Act" }));
  expect(change).toHaveBeenCalledWith("later");
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  view.rerender(<PreferredTrack value="later" onChange={change} disabled={false} />);
  expect(screen.getByText("Later — Act")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Clear track" }));
  expect(change).toHaveBeenCalledWith(null);
});
it("retries errors and shows an empty state", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(Response.json({ error: "Unavailable" }, { status: 503 }))
    .mockResolvedValueOnce(Response.json({ tracks: [], nextOffset: null })));
  render(<PreferredTrack value={null} onChange={vi.fn()} disabled={false} />);
  fireEvent.click(screen.getByRole("button", { name: /Preferred track/ }));
  fireEvent.click(await screen.findByRole("button", { name: "Retry" }));
  expect(await screen.findByText("No tracks available yet.")).toBeTruthy();
});
it("looks up saved tracks directly and preserves unavailable choices", async () => {
  const fetcher = vi.fn(async () => Response.json({ tracks: [] }));
  vi.stubGlobal("fetch", fetcher);
  const change = vi.fn();
  render(<PreferredTrack value="withdrawn" onChange={change} disabled={false} />);
  await screen.findByText("Selected track unavailable");
  expect(fetcher).toHaveBeenCalledWith("/api/tracks?id=withdrawn", expect.anything());
  expect(change).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Clear track" }));
  expect(change).toHaveBeenCalledWith(null);
});
it("prevents opening when disabled", () => {
  render(<PreferredTrack value={null} onChange={vi.fn()} disabled />);
  fireEvent.click(screen.getByRole("button", { name: /Preferred track/ }));
  expect(screen.queryByRole("dialog")).toBeNull();
});
it("dismisses with Escape without changing the preference", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ tracks: [], nextOffset: null })));
  const change = vi.fn();
  render(<PreferredTrack value={null} onChange={change} disabled={false} />);
  fireEvent.click(screen.getByRole("button", { name: /Preferred track/ }));
  const input = await screen.findByRole("searchbox");
  fireEvent.keyDown(input, { key: "Escape", code: "Escape" });
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(change).not.toHaveBeenCalled();
});
