// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ artist: vi.fn(), profile: vi.fn(), tracks: vi.fn(), sign: vi.fn() }));
vi.mock("@/lib/hosted-audio/r2", () => ({ signMediaObject: mocks.sign }));
vi.mock("@/lib/hosted-audio/server", () => ({ listHostedTracks: mocks.tracks }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => ({ select: () => ({ eq: () => ({
      maybeSingle: table === "profiles" ? mocks.profile : mocks.artist,
    }) }) }),
  }),
}));
import { loadArtist } from "./server";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.artist.mockResolvedValue({ data: {
    id: "artist", slug: "new-act", name: "New Act", claimed_by: "owner",
    bio: "Artist biography", website_url: "https://artist.example", avatar_key: "avatar",
  }, error: null });
  mocks.profile.mockResolvedValue({ data: { username: "creator", vis_count: 1 } });
  mocks.tracks.mockResolvedValue([]);
  mocks.sign.mockResolvedValue({ url: "https://signed.example" });
});

it("publishes the full profile and creator link before any music is live", async () => {
  expect(await loadArtist("new-act")).toMatchObject({
    name: "New Act", bio: "Artist biography", websiteUrl: "https://artist.example",
    avatarUrl: "https://signed.example", creatorUsername: "creator", tracks: [],
  });
  expect(mocks.sign).toHaveBeenCalledWith("avatar");
});

it("does not link to a creator without public visualisations", async () => {
  mocks.profile.mockResolvedValue({ data: { username: "creator", vis_count: 0 } });
  expect(await loadArtist("new-act")).toMatchObject({ creatorUsername: null });
});
