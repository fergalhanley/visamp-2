import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ wire: vi.fn(), restore: vi.fn(async () => {}), apply: vi.fn() }));
vi.mock("@/lib/store/audio", () => ({ wireAudioEvents: m.wire, useAudioStore: { getState: () => ({ restore: m.restore, applyPreferredTrack: m.apply }) } }));
import { usePreviewAudio } from "./use-preview-audio";
afterEach(() => { cleanup(); vi.clearAllMocks(); });
it("initialises events and restores before applying the preview preference", async () => {
  const view = renderHook(() => usePreviewAudio("preview", "track"));
  await waitFor(() => expect(m.apply).toHaveBeenCalledWith("preview", "track", expect.any(Function)));
  expect(m.wire).toHaveBeenCalled();
  expect(m.restore).toHaveBeenCalledWith("track");
  const current = m.apply.mock.calls[0]![2] as () => boolean;
  expect(current()).toBe(true);
  view.unmount();
  expect(current()).toBe(false);
});
it("drops stale preferences if the preview changes during restoration", async () => {
  let finish!: () => void;
  m.restore.mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; }));
  const view = renderHook(({ id }) => usePreviewAudio(id, "track"), { initialProps: { id: "old" } });
  view.rerender({ id: "new" });
  finish();
  await waitFor(() => expect(m.apply).toHaveBeenCalledTimes(1));
  expect(m.apply).toHaveBeenCalledWith("new", "track", expect.any(Function));
});
