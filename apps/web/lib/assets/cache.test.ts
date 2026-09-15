import { describe, it, expect, vi } from "vitest";
import { DecodedAssetCache } from "./cache";
import type { ResolvedAsset } from "@visamp/player";
const asset = (id: string, size = 4): ResolvedAsset => ({
  id,
  kind: "texture",
  width: 1,
  height: 1,
  rgba: new Uint8Array(size),
});
describe("decoded asset cache", () => {
  it("shares pending loads and caches decoded values", async () => {
    const cache = new DecodedAssetCache();
    const load = vi.fn(async () => asset("a"));
    const [a, b] = await Promise.all([
      cache.get("a", load),
      cache.get("a", load),
    ]);
    expect(a).toBe(b);
    expect(await cache.get("a", load)).toBe(a);
    expect(load).toHaveBeenCalledTimes(1);
  });
  it("evicts least recently used data within the byte budget", async () => {
    const cache = new DecodedAssetCache(8);
    const a = vi.fn(async () => asset("a"));
    const b = vi.fn(async () => asset("b"));
    await cache.get("a", a);
    await cache.get("b", b);
    await cache.get("a", a);
    await cache.get("c", async () => asset("c"));
    await cache.get("a", a);
    await cache.get("b", b);
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(2);
  });
  it("does not retain oversized assets or failed requests", async () => {
    const cache = new DecodedAssetCache(4);
    const large = vi.fn(async () => asset("a", 8));
    await cache.get("a", large);
    await cache.get("a", large);
    expect(large).toHaveBeenCalledTimes(2);
    await expect(
      cache.get("b", async () => {
        throw Error("offline");
      }),
    ).rejects.toThrow("offline");
    expect(await cache.get("b", async () => asset("b"))).toMatchObject({
      id: "b",
    });
  });
  it("rejects pending data from a cleared session", async () => {
    const cache = new DecodedAssetCache();
    let finish!: (a: ResolvedAsset) => void;
    const pending = cache.get(
      "a",
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    cache.clear();
    finish(asset("a"));
    await expect(pending).rejects.toThrow("session changed");
    const fresh = asset("a");
    expect(await cache.get("a", async () => fresh)).toBe(fresh);
  });
});
