import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ list: vi.fn(), get: vi.fn(), rate: vi.fn() }));
vi.mock("@/lib/hosted-audio/server", () => ({ listHostedTracks: mocks.list, getHostedTrackSummary: mocks.get }));
vi.mock("@/lib/rate-limit", () => ({ checkApiRateLimit: mocks.rate }));
import { GET } from "@/app/api/tracks/route";
const id = "11111111-1111-4111-8111-111111111111";
beforeEach(() => { vi.clearAllMocks(); mocks.rate.mockResolvedValue({ allowed: true }); });
it("looks up one saved track without listing a capped catalogue", async () => {
  mocks.get.mockResolvedValue({ id, title: "Saved song" });
  const response = await GET(new Request(`https://visamp.app/api/tracks?id=${id}`));
  expect(await response.json()).toEqual({ tracks: [{ id, title: "Saved song" }] });
  expect(mocks.get).toHaveBeenCalledWith(id);
  expect(mocks.list).not.toHaveBeenCalled();
});
it("returns an empty selection for a non-playable track", async () => {
  mocks.get.mockResolvedValue(null);
  expect(await (await GET(new Request(`https://visamp.app/api/tracks?id=${id}`))).json()).toEqual({ tracks: [] });
});
it("rejects malformed ids before lookup", async () => {
  expect((await GET(new Request("https://visamp.app/api/tracks?id=bad"))).status).toBe(400);
  expect(mocks.get).not.toHaveBeenCalled();
});
it("keeps the existing catalogue response", async () => {
  mocks.list.mockResolvedValue([]);
  expect(await (await GET(new Request("https://visamp.app/api/tracks"))).json()).toEqual({ tracks: [] });
  expect(mocks.list).toHaveBeenCalledOnce();
});
