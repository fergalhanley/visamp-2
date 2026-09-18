import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useMusicPages } from "./use-music-pages";
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("appends the next page, deduplicates rows and stops at the final page", async () => {
  const fetch = vi.fn(async (url: string) =>
    Response.json(
      url.includes("offset=40")
        ? { tracks: [{ id: "one" }, { id: "two" }], nextOffset: null }
        : { tracks: [{ id: "one" }], nextOffset: 40 },
    ),
  );
  vi.stubGlobal("fetch", fetch);
  const { result } = renderHook(() =>
    useMusicPages<{ id: string }>("/tracks?q=song", "tracks"),
  );
  await waitFor(() => expect(result.current.items).toEqual([{ id: "one" }]));
  act(() => result.current.more());
  await waitFor(() =>
    expect(result.current.items).toEqual([{ id: "one" }, { id: "two" }]),
  );
  expect(fetch.mock.calls[1]?.[0]).toBe("/tracks?q=song&offset=40");
  expect(result.current.next).toBeNull();
});
it("ignores an old filter response after a new filter finishes", async () => {
  let resolveOld!: (response: Response) => void;
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) =>
      url.includes("old")
        ? new Promise<Response>((resolve) => {
            resolveOld = resolve;
          })
        : Promise.resolve(
            Response.json({ tracks: [{ id: "new" }], nextOffset: null }),
          ),
    ),
  );
  const { result, rerender } = renderHook(
    ({ url }) => useMusicPages<{ id: string }>(url, "tracks"),
    { initialProps: { url: "/tracks?q=old" } },
  );
  rerender({ url: "/tracks?q=new" });
  await waitFor(() => expect(result.current.items).toEqual([{ id: "new" }]));
  await act(async () =>
    resolveOld(Response.json({ tracks: [{ id: "old" }], nextOffset: null })),
  );
  expect(result.current.items).toEqual([{ id: "new" }]);
});
it("retains loaded rows and retries the failed continuation", async () => {
  let fail = true;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) =>
      url.includes("offset=40")
        ? fail
          ? Response.json({ error: "Network failed" }, { status: 503 })
          : Response.json({ tracks: [{ id: "two" }], nextOffset: null })
        : Response.json({ tracks: [{ id: "one" }], nextOffset: 40 }),
    ),
  );
  const { result } = renderHook(() =>
    useMusicPages<{ id: string }>("/tracks", "tracks"),
  );
  await waitFor(() => expect(result.current.items).toHaveLength(1));
  act(() => result.current.more());
  await waitFor(() => expect(result.current.error).toBe("Network failed"));
  expect(result.current.items).toEqual([{ id: "one" }]);
  fail = false;
  act(() => result.current.more());
  await waitFor(() => expect(result.current.items).toHaveLength(2));
});
