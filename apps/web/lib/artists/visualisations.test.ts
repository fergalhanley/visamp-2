// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const m = vi.hoisted(() => ({
  from: vi.fn(),
  eq: vi.fn(),
  in: vi.fn(),
  limit: vi.fn(),
}));
vi.mock("@/lib/supabase/public", () => ({
  createPublicClient: () => ({ from: m.from }),
}));
import { loadArtistVisualisations } from "./visualisations";
beforeEach(() => {
  vi.clearAllMocks();
  const q = {
    select: () => q,
    eq: m.eq,
    in: m.in,
    order: () => q,
    limit: m.limit,
  };
  m.from.mockReturnValue(q);
  m.eq.mockReturnValue(q);
  m.in.mockReturnValue(q);
  m.limit.mockResolvedValue({
    data: [
      {
        id: "vis",
        slug: "public-vis",
        title: "Public visual",
        preferred_track_id: "track",
        thumb_path: null,
        updated_at: "",
        profiles: { username: "another-creator" },
      },
    ],
    error: null,
  });
});
it("loads public work using the artist's playable track ids, regardless of creator", async () => {
  const items = await loadArtistVisualisations([
    { id: "track", title: "Artist's song" } as never,
  ]);
  expect(m.eq).toHaveBeenCalledWith("visibility", "public");
  expect(m.in).toHaveBeenCalledWith("preferred_track_id", ["track"]);
  expect(items[0]).toMatchObject({
    creator: "another-creator",
    track: "Artist's song",
    slug: "public-vis",
  });
});
it("never queries unrelated work when the artist has no playable tracks", async () => {
  expect(await loadArtistVisualisations([])).toEqual([]);
  expect(m.from).not.toHaveBeenCalled();
});
