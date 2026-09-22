import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  play: vi.fn(),
  playing: false,
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
        kind: "hosted",
        hostedTracks: [{ hostedTrackId: "track" }],
        currentIndex: 0,
        pendingIndex: -1,
        isPlaying: mocks.playing,
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
  mocks.playing = false;
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
              { id: "artist", name: "First Artist", slug: "first-artist", trackCount: 9, artworkUrl: "/api/artwork/artist/artist" },
            ],
            nextOffset: null,
          }
        : url.includes("collections")
          ? {
              playlists: [{ id: "playlist", title: "Evening", trackCount: 17 }],
            }
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
  fireEvent.click(screen.getByRole("tab", { name: "artists" }));
  fireEvent.click(await screen.findByRole("button", { name: "First Artist - 9 tracks" }));
  await waitFor(() =>
    expect(
      fetch.mock.calls.some(([url]) => url.includes("artist=first-artist")),
    ).toBe(true),
  );
  expect(
    screen.getByRole("tab", { name: "tracks" }).getAttribute("aria-selected"),
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
  fireEvent.click(screen.getByRole("tab", { name: "playlists" }));
  fireEvent.click(
    await screen.findByRole("button", { name: "Evening - 17 tracks" }),
  );
  await waitFor(() =>
    expect(
      fetch.mock.calls.some(([url]) => url.includes("playlist=playlist")),
    ).toBe(true),
  );
  expect(
    screen.getByRole("tab", { name: "tracks" }).getAttribute("aria-selected"),
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
  fireEvent.click(screen.getByRole("tab", { name: "favourites" }));
  expect(screen.getByRole("button", { name: "Sign in" })).toBeTruthy();
  expect(
    fetch.mock.calls.some(([url]) => url.includes("favourites=true")),
  ).toBe(false);
});

it("updates favourites before saving, then restores them if saving fails", async () => {
  let finish!: (r: Response) => void;
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) =>
      url.includes("collections")
        ? new Promise<Response>((resolve) => {
            finish = resolve;
          })
        : Promise.resolve(Response.json({ tracks: [track], nextOffset: null })),
    ),
  );
  render(<MusicLibrary />);
  fireEvent.click(
    await screen.findByRole("button", { name: "Favourite First Song" }),
  );
  expect(
    screen
      .getByRole("button", { name: "Unfavourite First Song" })
      .getAttribute("aria-pressed"),
  ).toBe("true");
  await act(async () =>
    finish(Response.json({ error: "Save failed" }, { status: 503 })),
  );
  expect(
    await screen.findByRole("button", { name: "Favourite First Song" }),
  ).toBeTruthy();
  expect(screen.getByRole("alert").textContent).toContain("Save failed");
});
it("opens artist profiles separately and keeps the link sized to its text", async () => {
  mockFetch();
  render(<MusicLibrary />);
  const link = await screen.findByRole("link", { name: "First Artist" });
  expect(link.getAttribute("target")).toBe("_blank");
  expect(link.className).toContain("inline-block");
  expect(
    screen
      .getByRole("button", { name: "Play First Song" })
      .querySelector("svg"),
  ).toBeNull();
});

it("shows the playing indicator beside the heart only during playback", async () => {
  mockFetch();
  const view = render(<MusicLibrary />);
  await screen.findByRole("button", { name: "Favourite First Song" });
  expect(screen.queryByLabelText("Playing")).toBeNull();
  mocks.playing = true;
  view.rerender(<MusicLibrary />);
  expect(screen.getByLabelText("Playing").nextElementSibling).toBe(screen.getByRole("button", { name: "Favourite First Song" }));
  mocks.playing = false;
  view.rerender(<MusicLibrary />);
  expect(screen.queryByLabelText("Playing")).toBeNull();
});
it("removes an unfavourited row immediately and restores it on save failure", async () => {
  let finish!: (r: Response) => void;
  vi.stubGlobal("fetch", vi.fn((url: string) => url.includes("collections")
    ? new Promise<Response>((resolve) => { finish = resolve; })
    : Promise.resolve(Response.json({ tracks: [{ ...track, favourite: true }], nextOffset: null }))));
  render(<MusicLibrary />);
  fireEvent.click(screen.getByRole("tab", { name: "favourites" }));
  fireEvent.click(await screen.findByRole("button", { name: "Unfavourite First Song" }));
  expect(screen.queryByRole("button", { name: "Play First Song" })).toBeNull();
  await act(async () => finish(Response.json({ error: "Save failed" }, { status: 503 })));
  expect(await screen.findByRole("button", { name: "Unfavourite First Song" })).toBeTruthy();
});
