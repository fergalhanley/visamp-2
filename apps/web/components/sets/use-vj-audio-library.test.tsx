import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useVjAudioLibrary } from "./use-vj-audio-library";
const client = vi.hoisted(() => ({ request: vi.fn(), fileRef: vi.fn() }));
vi.mock("@/lib/sets/client", () => client);
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
it("browses SoundCloud without playback and routes a selection to the authoritative output", async () => {
  client.request.mockResolvedValue({
    title: "Playlist",
    tracks: [{ id: 42, title: "Song", artist: "Artist", durationMs: 12000 }],
  });
  const select = vi.fn().mockResolvedValue(undefined);
  const { result } = renderHook(() =>
    useVjAudioLibrary(select, undefined, false),
  );
  await act(() =>
    result.current.library.loadSoundcloudPlaylist(
      "https://soundcloud.com/test",
    ),
  );
  expect(select).not.toHaveBeenCalled();
  expect(result.current.library.soundcloudTracks[0]?.name).toBe("Song");
  await act(() => result.current.library.playIndex(0));
  expect(select.mock.calls[0]?.[0]).toEqual({
    id: "42",
    title: "Song",
    attribution: "Artist",
    durationMs: 12000,
    kind: "audio",
    source: "soundcloud",
  });
});
it("prepares local files for output-window access and starts the first selection", async () => {
  const ref = {
    id: "file:one",
    kind: "audio",
    source: "file",
    title: "one.wav",
    durationMs: 1000,
    attribution: "My files",
  };
  client.fileRef.mockResolvedValue(ref);
  const select = vi.fn().mockResolvedValue(undefined);
  const { result } = renderHook(() =>
    useVjAudioLibrary(
      select,
      ref as Parameters<typeof useVjAudioLibrary>[1],
      true,
    ),
  );
  const file = new File(["audio"], "one.wav");
  act(() => result.current.library.addFiles([file]));
  await waitFor(() => expect(select).toHaveBeenCalledWith(ref, [ref]));
  expect(client.fileRef.mock.calls[0]?.[0]).toBe(file);
  expect(result.current.library.currentIndex).toBe(0);
  expect(result.current.library.isPlaying).toBe(true);
  act(() => result.current.library.removeTrack(ref.id));
  expect(result.current.library.tracks).toHaveLength(0);
});
it("does not restore a SoundCloud playlist cleared while loading", async () => {
  let finish!: (value: unknown) => void;
  client.request.mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  const { result } = renderHook(() =>
    useVjAudioLibrary(vi.fn(), undefined, false),
  );
  let pending!: Promise<void>;
  act(() => {
    pending = result.current.library.loadSoundcloudPlaylist("link");
  });
  act(() => result.current.library.clearSoundcloud());
  await act(async () => {
    finish({ tracks: [{ id: 1 }] });
    await pending;
  });
  expect(result.current.library.soundcloudPlaylist).toBeNull();
  expect(result.current.library.soundcloudTracks).toHaveLength(0);
  expect(result.current.library.soundcloudLoading).toBe(false);
});
