import { afterEach, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({
  seek: vi.fn(),
  pause: vi.fn(),
  position: vi.fn(() => 5),
}));
vi.mock("@/lib/audio/audio-engine", () => ({
  AudioEngine: class {
    setEvents() {}
    async playUrl() {}
    seek = mock.seek;
    pause = mock.pause;
    position = mock.position;
    isMediaActuallyPlaying() {
      return true;
    }
    dispose() {}
  },
}));
vi.mock("./client", () => ({
  request: async () => ({ sources: [{ format: "mp3", url: "/track.mp3" }] }),
  localFile: vi.fn(),
}));
import { SetAudio } from "./audio";
import type { Scheduled } from "./scheduler";
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
it("applies explicit sub-250ms seeks while retaining tolerance for ordinary clock drift", async () => {
  const node = () => ({
    connect: vi.fn(),
    disconnect: vi.fn(),
    gain: { value: 0, setTargetAtTime: vi.fn() },
  });
  vi.stubGlobal(
    "AudioContext",
    class {
      currentTime = 0;
      destination = {};
      createAnalyser = node;
      createGain = node;
      async close() {}
    },
  );
  const audio = new SetAudio(vi.fn());
  const item: Scheduled = {
    clip: {
      id: "a",
      media: {
        id: "a",
        kind: "audio",
        source: "hosted",
        title: "Track",
        attribution: "Artist",
      },
      startMs: 0,
      sourceOffsetMs: 5000,
      durationMs: 10000,
      fadeInMs: 0,
      fadeOutMs: 0,
    },
    sourceMs: 5000,
    level: 1,
  };
  audio.sync([item], false, 1);
  await vi.waitFor(() => expect(mock.seek).toHaveBeenCalledWith(5));
  mock.seek.mockClear();
  audio.sync([{ ...item, sourceMs: 5100 }], false, 1);
  expect(mock.seek).not.toHaveBeenCalled();
  audio.seekOnNextSync();
  audio.sync([{ ...item, sourceMs: 5100 }], false, 1);
  expect(mock.seek).toHaveBeenCalledWith(5.1);
  mock.seek.mockClear();
  audio.sync([{ ...item, sourceMs: 5100 }], false, 1);
  expect(mock.seek).not.toHaveBeenCalled();
  audio.dispose();
});
