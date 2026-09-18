import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("react", () => ({ cache: (fn: unknown) => fn }));
const mocks = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock("@/lib/supabase/public", () => ({ createPublicClient: () => ({ from: mocks.from }) }));
import { loadPublicCreator } from "./server";

function query(data: unknown, error: unknown = null) {
  const q = { select: vi.fn(() => q), eq: vi.fn(() => q), order: vi.fn(() => q), maybeSingle: vi.fn().mockResolvedValue({ data, error }), limit: vi.fn().mockResolvedValue({ data, error }) };
  return q;
}
beforeEach(() => vi.clearAllMocks());

it("distinguishes absent/no-public-work creators from database outages", async () => {
  mocks.from.mockReturnValueOnce(query(null));
  expect(await loadPublicCreator("missing")).toBeNull();
  mocks.from.mockReturnValueOnce(query({ id: "owner", username: "private" })).mockReturnValueOnce(query([]));
  expect(await loadPublicCreator("private")).toBeNull();
  mocks.from.mockReturnValueOnce(query(null, { message: "unavailable" }));
  await expect(loadPublicCreator("outage")).rejects.toThrow("Could not load creator");
});

it("loads only the selected creator's public work for server rendering", async () => {
  const profile = query({ id: "owner", username: "maker", bio: "Music and motion", vis_count: 1, total_views: 5 });
  const work = query([{ id: "work", owner_id: "owner", title: "Waves", source: "", visibility: "public", like_count: 2 }]);
  mocks.from.mockReturnValueOnce(profile).mockReturnValueOnce(work);
  const result = await loadPublicCreator("maker");
  expect(profile.eq).toHaveBeenCalledWith("username", "maker");
  expect(work.eq.mock.calls).toEqual([["owner_id", "owner"], ["visibility", "public"]]);
  expect(result?.stats.creator.bio).toBe("Music and motion");
  expect(result?.work[0]).toMatchObject({ id: "work", title: "Waves", visibility: "public" });
});
