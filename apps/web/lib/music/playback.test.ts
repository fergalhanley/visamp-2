import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("@/lib/audio/audio-engine", () => ({
  getAudioEngine: () => ({ disableMic: vi.fn(), stopFiles: vi.fn() }),
}));
vi.mock("@/lib/store/session", () => ({
  useSessionStore: { getState: () => ({ shuffleTracks: false }) },
}));
import { useAudioStore } from "@/lib/store/audio";
import type { HostedTrackSummary } from "@/lib/hosted-audio/types";
const play = vi.fn();
const first = {
  id: "first",
  title: "First",
  artist: "Artist",
  durationMs: 1000,
} as HostedTrackSummary;
const second = { ...first, id: "second", title: "Second" };
beforeEach(() => {
  useAudioStore.setState({
    ...useAudioStore.getInitialState(),
    playIndex: play,
  });
  play.mockReset();
});
afterEach(() => vi.unstubAllGlobals());
it("sets the explicitly selected hosted queue before playing its selected track", async () => {
  await useAudioStore
    .getState()
    .playHostedSelection("second", [first, second], {
      url: "/api/music/tracks?artist=artist",
      nextOffset: 40,
    });
  expect(
    useAudioStore.getState().hostedTracks.map((t) => t.hostedTrackId),
  ).toEqual(["first", "second"]);
  expect(play).toHaveBeenCalledWith(1);
});
it("continues the selected playlist beyond its first page instead of looping early", async () => {
  await useAudioStore
    .getState()
    .playHostedSelection("first", [first], {
      url: "/api/music/tracks?playlist=playlist",
      nextOffset: 40,
    });
  useAudioStore.setState({ currentIndex: 0 });
  play.mockReset();
  const fetch = vi.fn(async () =>
    Response.json({ tracks: [second], nextOffset: null }),
  );
  vi.stubGlobal("fetch", fetch);
  await useAudioStore.getState().nextTrack();
  expect(fetch).toHaveBeenCalledWith(
    "/api/music/tracks?playlist=playlist&offset=40",
    { cache: "no-store" },
  );
  expect(
    useAudioStore.getState().hostedTracks.map((t) => t.hostedTrackId),
  ).toEqual(["first", "second"]);
  expect(play).toHaveBeenCalledWith(1, false);
  expect(useAudioStore.getState().musicExplicit).toBe(true);
});
it("does not replace a newer selection when an older page resolves", async () => {
  await useAudioStore
    .getState()
    .playHostedSelection("first", [first], {
      url: "/api/music/tracks?q=old",
      nextOffset: 40,
    });
  useAudioStore.setState({ currentIndex: 0 });
  let resolve!: (r: Response) => void;
  vi.stubGlobal(
    "fetch",
    vi.fn(
      () =>
        new Promise<Response>((r) => {
          resolve = r;
        }),
    ),
  );
  const next = useAudioStore.getState().nextTrack();
  await useAudioStore.getState().playHostedSelection("second", [second]);
  play.mockReset();
  resolve(Response.json({ tracks: [first], nextOffset: null }));
  await next;
  expect(
    useAudioStore.getState().hostedTracks.map((t) => t.hostedTrackId),
  ).toEqual(["second"]);
  expect(play).not.toHaveBeenCalled();
});
