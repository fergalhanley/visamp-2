import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { saveDocument } from "./save-document";
const snapshot = {
  title: "Draft",
  source: "render {}",
  visibility: "private" as const,
};
const signal = new AbortController().signal;
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

it("persists the document before attempting its thumbnail", async () => {
  const calls: string[] = [];
  await saveDocument(
    snapshot,
    signal,
    async () => {
      calls.push("document");
    },
    async () => {
      calls.push("thumbnail");
    },
    vi.fn(),
  );
  expect(calls).toEqual(["document", "thumbnail"]);
});

it("finishes saving and warns when thumbnail capture never settles", async () => {
  const write = vi.fn(async () => {}),
    warn = vi.fn();
  const refresh = vi.fn<(signal: AbortSignal) => Promise<void>>(
    () => new Promise(() => {}),
  );
  const result = saveDocument(snapshot, signal, write, refresh, warn);
  await vi.advanceTimersByTimeAsync(5000);
  await result;
  expect(write).toHaveBeenCalledOnce();
  expect(refresh.mock.calls[0]![0].aborted).toBe(true);
  expect(warn).toHaveBeenCalledWith(expect.stringContaining("Changes saved"));
});

it("preserves a failed document write as a save failure", async () => {
  const refresh = vi.fn();
  await expect(
    saveDocument(
      snapshot,
      signal,
      async () => {
        throw Error("Write failed");
      },
      refresh,
      vi.fn(),
    ),
  ).rejects.toThrow("Write failed");
  expect(refresh).not.toHaveBeenCalled();
});
