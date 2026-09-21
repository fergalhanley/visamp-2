import { afterEach, beforeEach, expect, it, vi } from "vitest";
const engine = vi.hoisted(() => ({
  playUrl: vi.fn(async () => {}),
  disableMic: vi.fn(),
  stopFiles: vi.fn(),
  playHlsStream: vi.fn(async () => {}),
  playFile: vi.fn(async () => {}),
  setEvents: vi.fn(),
  seek: vi.fn(),
}));
const stored = vi.hoisted(() => ({ url: "" }));
vi.mock("@/lib/audio/audio-engine", () => ({ getAudioEngine: () => engine }));
vi.mock("@/lib/analytics/client", () => ({ track: vi.fn() }));
vi.mock("@/lib/audio/persistence", () => ({
  loadSoundcloudUrl: () => stored.url,
  loadTrackNames: () => [],
  supportsFileSystemAccess: () => false,
  saveSoundcloudUrl: vi.fn(),
  saveTrackNames: vi.fn(),
}));
vi.mock("@/lib/visript/default", () => ({
  DEFAULT_VISUALISATION: { id: "default", source: "" },
}));
vi.mock("@/lib/fixtures/visualisations", () => ({ VISUALISATIONS: [] }));
import { useAudioStore, wireAudioEvents } from "./audio";
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
    ...useSessionStore.getInitialState(),
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
        url.startsWith("/api/tracks") && !url.includes("/playback")
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
it("remembers SoundCloud without making it the default, even before a vis has loaded", async () => {
  stored.url = "https://soundcloud.com/user/sets/chosen";
  await useAudioStore.getState().restore(null);
  expect(useAudioStore.getState()).toMatchObject({ kind: "hosted", musicExplicit: false, soundcloudUrl: stored.url });
  expect(vi.mocked(fetch).mock.calls.every(([url]) => !String(url).includes("soundcloud"))).toBe(true);
  await useAudioStore.getState().applyPreferredTrack("vis", "track");
  expect(engine.playUrl).toHaveBeenCalled();
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
it("plays a preview preference without relying on the main player's selection", async () => {
  await useAudioStore.getState().applyPreferredTrack("editor-vis", "track", () => true);
  expect(engine.playUrl).toHaveBeenCalled();
  expect(fetch).toHaveBeenCalledWith("/api/tracks?id=track", expect.anything());
});
it("does not play a preference after the preview has changed", async () => {
  let finish!: (response: Response) => void;
  vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(resolve => { finish = resolve; })));
  let current = true;
  const pending = useAudioStore.getState().applyPreferredTrack("preview", "track", () => current);
  current = false;
  finish(Response.json({ tracks: [preferred] }));
  await pending;
  expect(engine.playUrl).not.toHaveBeenCalled();
});
it("immediately plays the first newly added file, including when appending", async () => {
  const first = new File(["audio"], "first.mp3");
  const second = new File(["audio"], "second.mp3");
  useAudioStore.getState().addFiles([first]);
  await Promise.resolve();
  expect(engine.playFile).toHaveBeenLastCalledWith(first);
  useAudioStore.getState().addFiles([second]);
  await Promise.resolve();
  expect(engine.playFile).toHaveBeenLastCalledWith(second);
  expect(useAudioStore.getState()).toMatchObject({ currentIndex: 1, isPlaying: true, musicExplicit: true });
});
it("ignores an empty file selection", () => {
  useAudioStore.getState().addFiles([]);
  expect(engine.playFile).not.toHaveBeenCalled();
  expect(useAudioStore.getState().musicExplicit).toBe(false);
});
it("cancels a preview preference while its playback URL is loading", async () => {
  let finish!: (response: Response) => void;
  vi.stubGlobal("fetch", vi.fn(async (url: string) => url.includes("?id=")
    ? Response.json({ tracks: [preferred] })
    : new Promise<Response>(resolve => { finish = resolve; })));
  let current = true;
  const pending = useAudioStore.getState().applyPreferredTrack("preview", "track", () => current);
  await vi.waitFor(() => expect(finish).toBeDefined());
  current = false;
  finish(Response.json({ sources: [{ format: "mp3", url: "https://audio.example/song.mp3" }] }));
  await pending;
  expect(engine.playUrl).not.toHaveBeenCalled();
  expect(useAudioStore.getState().pendingIndex).toBe(-1);
});
it.each(["hosted", "soundcloud", "files"] as const)("updates the %s scrubber from media events and seeks the engine", kind => {
  useAudioStore.setState({ kind });
  wireAudioEvents();
  const events = engine.setEvents.mock.calls[0]![0] as { onTimeUpdate: (position: number, duration: number) => void };
  events.onTimeUpdate(12, 180);
  expect(useAudioStore.getState()).toMatchObject({ position: 12, duration: 180 });
  useAudioStore.getState().seek(90);
  expect(engine.seek).toHaveBeenCalledWith(90);
  events.onTimeUpdate(91, 180);
  expect(useAudioStore.getState().position).toBe(91);
});

it("keeps automatic audio playing when a different visual is selected", async () => {
  await useAudioStore.getState().applyPreferredTrack("vis", "track");
  vi.clearAllMocks();
  useSessionStore.setState({ current: { ...useSessionStore.getState().current, id: "next" } });
  await useAudioStore.getState().applyPreferredTrack("next", "track");
  expect(engine.stopFiles).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
});
it("does not replace a pending listener playback request", async () => {
  useAudioStore.setState({ pendingIndex: 0 });
  await useAudioStore.getState().applyPreferredTrack("vis", "track");
  expect(fetch).not.toHaveBeenCalled();
});
function endTrack() {
  wireAudioEvents();
  const events = engine.setEvents.mock.calls.at(-1)![0] as { onEnded: () => void };
  events.onEnded();
}
it("advances the visual before choosing its preferred track in Per Track mode", async () => {
  await useAudioStore.getState().applyPreferredTrack("vis", "track");
  const old = useSessionStore.getState().current;
  useSessionStore.setState({ context: [old, { ...old, id: "next", preferredTrackId: "next-track" }] });
  vi.stubGlobal("fetch", vi.fn(async (url: string) => url.includes("?id=")
    ? Response.json({ tracks: [{ ...preferred, id: "next-track" }] })
    : Response.json({ sources: [{ format: "mp3", url: "https://audio.example/next.mp3" }] })));
  endTrack();
  await vi.waitFor(() => expect(engine.playUrl).toHaveBeenLastCalledWith("https://audio.example/next.mp3"));
  expect(useSessionStore.getState().current.id).toBe("next");
  expect(fetch).not.toHaveBeenCalledWith("/api/tracks/track/playback", expect.anything());
});
it("replays the preferred track when the Per Track visual stays the same", async () => {
  await useAudioStore.getState().applyPreferredTrack("vis", "track");
  useSessionStore.setState({ context: [useSessionStore.getState().current] });
  engine.playUrl.mockClear();
  endTrack();
  await vi.waitFor(() => expect(engine.playUrl).toHaveBeenCalledTimes(1));
});
it("a single hosted-track override expires at Per Track completion", async () => {
  await useAudioStore.getState().playHostedSelection("track", [preferred as never], { url: "/api/music/tracks?q=", nextOffset: null, scope: "track" });
  endTrack();
  await vi.waitFor(() => expect(useAudioStore.getState().musicExplicit).toBe(false));
  expect(useAudioStore.getState().selectionScope).toBe(null);
  await vi.waitFor(() => expect(fetch).toHaveBeenCalledWith("/api/tracks?id=track", expect.anything()));
});
it.each(["playlist", "artist", "favourites"])("keeps the selected %s queue at completion", async kind => {
  await useAudioStore.getState().playHostedSelection("track", [preferred as never], { url: `/api/music/tracks?${kind}=id`, nextOffset: null, scope: "collection" });
  vi.clearAllMocks();
  endTrack();
  await vi.waitFor(() => expect(engine.playUrl).toHaveBeenCalled());
  expect(useAudioStore.getState().musicExplicit).toBe(true);
  expect(fetch).not.toHaveBeenCalledWith("/api/tracks?id=track", expect.anything());
});
it.each(["files", "mic", "soundcloud", "silent"] as const)("preserves the explicitly selected %s source", async kind => {
  useAudioStore.setState({kind, musicExplicit: true, selectionScope: "source"});
  await useAudioStore.getState().applyPreferredTrack("vis", "track");
  expect(fetch).not.toHaveBeenCalled();
});
it("uses the preview's preferred track at completion, not an unrelated full-player visual", async () => {
  const apply = vi.fn();
  wireAudioEvents(apply);
  const events = engine.setEvents.mock.calls.at(-1)![0] as { onEnded: () => void };
  events.onEnded();
  expect(apply).toHaveBeenCalledTimes(1);
  expect(fetch).not.toHaveBeenCalled();
});
it("only the latest preferred request can claim playback", async () => {
  const responses: ((response: Response) => void)[] = [];
  vi.stubGlobal("fetch", vi.fn((url: string) => url.includes("?id=")
    ? new Promise<Response>(resolve => responses.push(resolve))
    : Promise.resolve(Response.json({ sources: [{ format: "mp3", url: "https://audio.example/song.mp3" }] }))));
  const first = useAudioStore.getState().applyPreferredTrack("preview", "track", () => true);
  const second = useAudioStore.getState().applyPreferredTrack("preview", "track", () => true);
  responses[1]!(Response.json({ tracks: [preferred] })); await second;
  responses[0]!(Response.json({ tracks: [preferred] })); await first;
  expect(engine.playUrl).toHaveBeenCalledTimes(1);
});
