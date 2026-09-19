import { afterEach, beforeEach, expect, it, vi } from "vitest";
const engine = vi.hoisted(() => ({
  playUrl: vi.fn(async () => {}),
  disableMic: vi.fn(),
  stopFiles: vi.fn(),
  playHlsStream: vi.fn(async () => {}),
}));
const stored = vi.hoisted(() => ({ url: "" }));
vi.mock("@/lib/audio/audio-engine", () => ({ getAudioEngine: () => engine }));
vi.mock("@/lib/analytics/client", () => ({ track: vi.fn() }));
vi.mock("@/lib/audio/persistence", () => ({
  loadSoundcloudUrl: () => stored.url,
  loadTrackNames: () => [],
  supportsFileSystemAccess: () => false,
  saveSoundcloudUrl: vi.fn(),
}));
vi.mock("@/lib/visript/default", () => ({
  DEFAULT_VISUALISATION: { id: "default", source: "" },
}));
vi.mock("@/lib/fixtures/visualisations", () => ({ VISUALISATIONS: [] }));
import { useAudioStore } from "./audio";
import { useSessionStore } from "./session";
const preferred = {
  id: "track",
  title: "Song",
  artist: "Artist",
  durationMs: 1000,
};
beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  stored.url = "";
  useAudioStore.setState({ ...useAudioStore.getInitialState() });
  useSessionStore.setState({
    current: {
      ...useSessionStore.getInitialState().current,
      id: "vis",
      preferredTrackId: "track",
    },
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) =>
      Response.json(
        url === "/api/tracks"
          ? { tracks: [preferred] }
          : {
              sources: [
                {
                  format: "mp3",
                  url: "https://audio.example/song.mp3",
                  expiresAt: new Date(Date.now() + 3600000).toISOString(),
                },
              ],
            },
      ),
    ),
  );
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
it("starts a preferred track when music has no explicit selection", async () => {
  await useAudioStore.getState().restore();
  await useAudioStore.getState().applyPreferredTrack("vis", "track");
  expect(engine.playUrl).toHaveBeenCalledWith("https://audio.example/song.mp3");
  expect(useAudioStore.getState()).toMatchObject({
    kind: "hosted",
    musicExplicit: false,
    currentIndex: 0,
  });
});
it.each(["track", "playlist", "favourites"])(
  "keeps an explicit %s selection",
  async (kind) => {
    await useAudioStore
      .getState()
      .playHostedSelection(
        "track",
        [preferred as never],
        kind === "track"
          ? undefined
          : { url: `/api/music/tracks?${kind}=true`, nextOffset: null },
      );
    vi.clearAllMocks();
    await useAudioStore.getState().applyPreferredTrack("vis", "track");
    expect(fetch).not.toHaveBeenCalled();
    expect(engine.playUrl).not.toHaveBeenCalled();
  },
);
it("does not override a restored SoundCloud playlist", async () => {
  stored.url = "https://soundcloud.com/user/sets/chosen";
  await useAudioStore.getState().restore();
  vi.clearAllMocks();
  await useAudioStore.getState().applyPreferredTrack("vis", "track");
  expect(fetch).not.toHaveBeenCalled();
});
it("abandons a delayed preferred selection when the listener chooses silence", async () => {
  let finish!: (response: Response) => void;
  vi.stubGlobal(
    "fetch",
    vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
    ),
  );
  const pending = useAudioStore.getState().applyPreferredTrack("vis", "track");
  useAudioStore.getState().setSilent();
  finish(Response.json({ tracks: [preferred] }));
  await pending;
  expect(engine.playUrl).not.toHaveBeenCalled();
  expect(useAudioStore.getState().kind).toBe("silent");
});
it("ignores stale visualisations and unavailable tracks", async () => {
  await useAudioStore.getState().applyPreferredTrack("older-vis", "track");
  expect(fetch).not.toHaveBeenCalled();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ tracks: [] })),
  );
  await useAudioStore.getState().applyPreferredTrack("vis", "track");
  expect(engine.playUrl).not.toHaveBeenCalled();
});
