import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ request: vi.fn(), changed: vi.fn() }));
vi.mock("@/components/chrome/top-bar", () => ({ TopBar: () => null }));
vi.mock("@/lib/music/client", () => ({
  musicRequest: m.request,
  collectionChanged: m.changed,
}));
vi.mock("@/hooks/use-music-pages", () => ({
  useMusicPages: () => ({
    items: [{ id: "track", title: "Track", artist: "Artist" }],
    loading: false,
    next: null,
    error: null,
    more: vi.fn(),
  }),
}));
import { PlaylistManager } from "./playlist-manager";
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});
it("opens a linked playlist and sends rename/add/remove actions for it", async () => {
  m.request.mockImplementation(async (_url, body) =>
    body
      ? {}
      : { playlists: [{ id: "playlist", title: "Night", trackCount: 1 }] },
  );
  render(<PlaylistManager initialId="playlist" />);
  fireEvent.change(await screen.findByLabelText("Playlist name"), {
    target: { value: "New name" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save name" }));
  await waitFor(() =>
    expect(m.request).toHaveBeenCalledWith("/api/music/collections", {
      action: "rename",
      playlistId: "playlist",
      title: "New name",
    }),
  );
  await waitFor(() =>
    expect(
      (screen.getByRole("button", { name: "Remove" }) as HTMLButtonElement)
        .disabled,
    ).toBe(false),
  );
  fireEvent.click(screen.getByRole("button", { name: "Remove" }));
  await waitFor(() =>
    expect(m.request).toHaveBeenCalledWith("/api/music/collections", {
      action: "remove",
      playlistId: "playlist",
      trackId: "track",
    }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Add tracks" }));
  await waitFor(() =>
    expect(
      (screen.getByRole("button", { name: "Add" }) as HTMLButtonElement)
        .disabled,
    ).toBe(false),
  );
  fireEvent.click(screen.getByRole("button", { name: "Add" }));
  await waitFor(() =>
    expect(m.request).toHaveBeenCalledWith("/api/music/collections", {
      action: "add",
      playlistId: "playlist",
      trackId: "track",
    }),
  );
});
it("keeps a playlist when deletion is cancelled", async () => {
  m.request.mockResolvedValue({
    playlists: [{ id: "playlist", title: "Night", trackCount: 1 }],
  });
  vi.spyOn(window, "confirm").mockReturnValue(false);
  render(<PlaylistManager initialId="playlist" />);
  fireEvent.click(
    await screen.findByRole("button", { name: "Delete playlist" }),
  );
  expect(m.request.mock.calls.every((call) => !call[1])).toBe(true);
});
