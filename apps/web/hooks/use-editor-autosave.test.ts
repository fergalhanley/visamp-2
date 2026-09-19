import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AUTOSAVE_MS,
  SAVE_TIMEOUT_MS,
  useEditorAutosave,
  type EditorSnapshot,
} from "./use-editor-autosave";

type Persist = (snapshot: EditorSnapshot, signal: AbortSignal) => Promise<void>;
const initial: EditorSnapshot = {
  title: "Draft",
  source: "render {}",
  visibility: "private",
};
function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const tick = async (ms = 0) => {
  await act(() => vi.advanceTimersByTimeAsync(ms));
};
const setup = (persist = vi.fn<Persist>(async () => {})) => {
  const onError = vi.fn();
  const view = renderHook(
    ({ value, enabled }) =>
      useEditorAutosave({ value, enabled, persist, onError }),
    {
      initialProps: { value: initial, enabled: true },
    },
  );
  const edit = (source: string, enabled = true) =>
    view.rerender({ value: { ...initial, source }, enabled });
  return { ...view, edit, persist, onError };
};
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-15T00:00:00Z"));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("editor autosave", () => {
  it("saves edits made during a pending write without needing another keystroke", async () => {
    const first = deferred();
    const persist = vi.fn<Persist>(async () => {});
    persist.mockImplementationOnce(() => first.promise);
    const { edit, result } = setup(persist);
    edit("first");
    await tick();
    expect(result.current.saving).toBe(true);
    edit("second");
    await tick(1000);
    expect(persist).toHaveBeenCalledTimes(1);
    await act(async () => first.resolve());
    expect(result.current.dirty).toBe(true);
    await tick(AUTOSAVE_MS - 1);
    expect(persist).toHaveBeenCalledTimes(1);
    await tick(1);
    expect(persist.mock.calls[1]![0].source).toBe("second");
    expect(result.current.dirty).toBe(false);
  });

  it("retries failures even when saving starts and finishes in one render", async () => {
    const persist = vi.fn<Persist>(async () => {});
    persist.mockRejectedValueOnce(new Error("Network unavailable"));
    const { edit, result, onError } = setup(persist);
    edit("changed");
    await tick();
    expect(result.current.saveError).toBe("Network unavailable");
    expect(result.current.saving).toBe(false);
    expect(result.current.dirty).toBe(true);
    expect(onError).toHaveBeenCalledWith("Network unavailable");
    await tick(AUTOSAVE_MS);
    expect(persist).toHaveBeenCalledTimes(2);
    expect(result.current.dirty).toBe(false);
    expect(result.current.saveError).toBeNull();
  });

  it("keeps the throttle deadline during continuous valid edits", async () => {
    const { edit, persist } = setup();
    edit("first");
    await tick();
    for (let i = 1; i <= 7; i++) {
      edit(`edit ${i}`);
      await tick(1000);
    }
    edit("latest");
    await tick(1000);
    expect(persist).toHaveBeenCalledTimes(2);
    expect(persist.mock.calls[1]![0].source).toBe("latest");
  });

  it("does not save uncompiled/read-only input using an older successful result", async () => {
    const { edit, persist } = setup();
    edit("valid");
    await tick();
    edit("invalid or not compiled yet", false);
    await tick(AUTOSAVE_MS * 2);
    expect(persist).toHaveBeenCalledTimes(1);
    edit("fixed", true);
    await tick();
    expect(persist.mock.calls[1]![0].source).toBe("fixed");
  });

  it("aborts stalled requests, reports the timeout and retries the latest snapshot", async () => {
    const persist = vi.fn<Persist>(async () => {});
    persist.mockImplementationOnce(() => new Promise(() => {}));
    const { edit, result } = setup(persist);
    edit("first");
    await tick();
    edit("latest");
    await tick(SAVE_TIMEOUT_MS);
    expect(persist.mock.calls[0]![1].aborted).toBe(true);
    expect(result.current.saveError).toContain("timed out");
    expect(result.current.saving).toBe(false);
    await tick(AUTOSAVE_MS);
    expect(persist.mock.calls[1]![0].source).toBe("latest");
    expect(result.current.dirty).toBe(false);
  });

  it("aborts a pending write when the editor unmounts", async () => {
    const request = deferred();
    const persist = vi.fn<Persist>(() => request.promise);
    const { edit, unmount, onError } = setup(persist);
    edit("first");
    await tick();
    unmount();
    expect(persist.mock.calls[0]![1].aborted).toBe(true);
    await act(async () => request.reject(new Error("Aborted")));
    expect(onError).not.toHaveBeenCalled();
  });

  it("cancels a scheduled save on unmount", async () => {
    const { edit, persist, unmount } = setup();
    edit("first");
    await tick();
    edit("second");
    unmount();
    await tick(AUTOSAVE_MS);
    expect(persist).toHaveBeenCalledTimes(1);
  });
});
it("saves and clears the preferred track even without source edits", async () => {
  const { rerender, persist } = setup();
  rerender({ value: { ...initial, preferred_track_id: "track" }, enabled: true });
  await tick();
  expect(persist.mock.calls[0]?.[0].preferred_track_id).toBe("track");
  rerender({ value: { ...initial, preferred_track_id: null }, enabled: true });
  await tick(AUTOSAVE_MS);
  expect(persist.mock.calls[1]?.[0].preferred_track_id).toBeNull();
});
