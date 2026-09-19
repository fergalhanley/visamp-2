import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ publicFrom: vi.fn(), adminFrom: vi.fn(), eq: vi.fn() }));
vi.mock("@/lib/supabase/public", () => ({ createPublicClient: () => ({ from: mocks.publicFrom }) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: mocks.adminFrom }) }));
import { pagedRows, publicSitemap } from "./seo-sitemap";

function query(data: unknown[]) {
  const q = { select: vi.fn(() => q), eq: vi.fn((...args: unknown[]) => { mocks.eq(...args); return q; }), order: vi.fn(() => q), range: vi.fn().mockResolvedValue({ data, error: null }) };
  return q;
}
beforeEach(() => vi.clearAllMocks());

it("paginates beyond the database's 1000-row limit and propagates errors", async () => {
  const fetchPage = vi.fn().mockResolvedValueOnce({ data: Array.from({ length: 1000 }, (_, i) => i), error: null })
    .mockResolvedValueOnce({ data: [1000], error: null });
  expect(await pagedRows(fetchPage)).toHaveLength(1001);
  expect(fetchPage.mock.calls).toEqual([[0, 999], [1000, 1999]]);
  await expect(pagedRows(() => Promise.resolve({ data: null, error: new Error("DB unavailable") }))).rejects.toThrow("Could not load");
});

it("uses public-only works, deduplicates creators and includes only artist slugs", async () => {
  mocks.publicFrom.mockReturnValue(query([
    { id: "one", slug: "prism-velvet-otter", updated_at: "2026-09-18T00:00:00Z", profiles: { username: "A & B" } },
    { id: "two", updated_at: "2026-09-19T00:00:00Z", profiles: { username: "A & B" } },
  ]));
  const artists = query([{ slug: "artist-one" }]);
  mocks.adminFrom.mockReturnValue(artists);
  const result = await publicSitemap();
  expect(mocks.eq).toHaveBeenCalledWith("visibility", "public");
  expect(artists.select).toHaveBeenCalledWith("slug");
  expect(result.filter(row => row.url.includes("/creators/"))).toEqual([{ url: "https://www.visamp.io/creators/A%20%26%20B" }]);
  expect(result).toContainEqual({ url: "https://www.visamp.io/vis/prism-velvet-otter", lastModified: "2026-09-18T00:00:00Z" });
  expect(result.some(row => row.url.includes("/artists/artist-one"))).toBe(true);
});
