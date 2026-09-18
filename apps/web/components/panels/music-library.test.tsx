import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  play: vi.fn(),
  user: { id: "owner" } as { id: string } | null,
}));
vi.mock("@/components/auth/auth-provider", () => ({
  useAuth: () => ({ user: mocks.user }),
}));
vi.mock("@/components/auth/sign-in-dialog", () => ({
  SignInDialog: () => null,
}));
vi.mock("@/lib/store/audio", () => ({
  useAudioStore: Object.assign(
    (select: (s: unknown) => unknown) =>
      select({
        kind: "silent",
        hostedTracks: [],
        currentIndex: -1,
        pendingIndex: -1,
        isPlaying: false,
        hostedError: null,
      }),
    { getState: () => ({ playHostedSelection: mocks.play }) },
  ),
}));
vi.mock("./load-more", () => ({ LoadMore: () => null }));
import { MusicLibrary } from "./music-library";
const track = {
  id: "track",
  title: "First Song",
  artist: "First Artist",
  artistSlug: "first-artist",
  favourite: false,
};
beforeEach(() => {
  mocks.user = { id: "owner" };
  mocks.play.mockReset();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
function mockFetch() {
  const fetch = vi.fn(async (url: string) =>
    Response.json(
      url.includes("/artists")
        ? {
            artists: [
              { id: "artist", name: "First Artist", slug: "first-artist" },
            ],
            nextOffset: null,
          }
        : url.includes("collections")
          ? { playlists: [{ id: "playlist", title: "Evening" }] }
          : { tracks: [track], nextOffset: null },
    ),
  );
  vi.stubGlobal("fetch", fetch);
  return fetch;
}
it("artist selection switches to filtered Tracks without changing playback", async () => {
  const fetch = mockFetch();
  render(<MusicLibrary />);
  await screen.findByRole("button", { name: "Play First Song" });
  expect(
    screen.getByRole("link", { name: "First Artist" }).getAttribute("href"),
  ).toBe("/artists/first-artist");
  fireEvent.click(screen.getByRole("button", { name: "artists" }));
  fireEvent.click(await screen.findByRole("button", { name: "First Artist" }));
  await waitFor(() =>
    expect(
      fetch.mock.calls.some(([url]) => url.includes("artist=first-artist")),
    ).toBe(true),
  );
  expect(
    screen.getByRole("button", { name: "tracks" }).getAttribute("aria-pressed"),
  ).toBe("true");
  expect(mocks.play).not.toHaveBeenCalled();
  fireEvent.click(
    await screen.findByRole("button", { name: "Play First Song" }),
  );
  expect(mocks.play).toHaveBeenCalledWith(
    "track",
    [track],
    expect.objectContaining({
      url: expect.stringContaining("artist=first-artist"),
      nextOffset: null,
    }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Clear music filter" }));
  await waitFor(() =>
    expect(fetch.mock.calls.at(-1)?.[0]).not.toContain("artist="),
  );
});
it("playlist selection loads that playlist on the Tracks tab", async () => {
  const fetch = mockFetch();
  render(<MusicLibrary />);
  fireEvent.click(screen.getByRole("button", { name: "playlists" }));
  fireEvent.click(await screen.findByRole("button", { name: "Evening" }));
  await waitFor(() =>
    expect(
      fetch.mock.calls.some(([url]) => url.includes("playlist=playlist")),
    ).toBe(true),
  );
  expect(
    screen.getByRole("button", { name: "tracks" }).getAttribute("aria-pressed"),
  ).toBe("true");
  expect(mocks.play).not.toHaveBeenCalled();
});
it("saves a favourite for the clicked track", async () => {
  const fetch = mockFetch();
  render(<MusicLibrary />);
  fireEvent.click(
    await screen.findByRole("button", { name: "Favourite First Song" }),
  );
  await waitFor(() =>
    expect(fetch).toHaveBeenCalledWith(
      "/api/music/collections",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          action: "favourite",
          trackId: "track",
          value: true,
        }),
      }),
    ),
  );
});
it("asks guests to sign in without requesting private collections", async () => {
  mocks.user = null;
  const fetch = mockFetch();
  render(<MusicLibrary />);
  fireEvent.click(screen.getByRole("button", { name: "favourites" }));
  expect(screen.getByRole("button", { name: "Sign in" })).toBeTruthy();
  expect(
    fetch.mock.calls.some(([url]) => url.includes("favourites=true")),
  ).toBe(false);
});
