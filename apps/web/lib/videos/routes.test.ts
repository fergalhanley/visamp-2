import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({
  user: "owner" as string | null,
  rows: {} as Record<string, unknown[]>,
  filters: [] as [string, string, unknown][],
  writes: [] as unknown[],
  select: [] as string[],
}));
function query(table: string) {
  const filters: [string, unknown][] = [];
  const result = () => ({
    data: (mocks.rows[table] ?? []).filter((row) =>
      filters.every(([key, value]) => {
        const actual = (row as Record<string, unknown>)[key];
        return Array.isArray(value) ? value.includes(actual) : value === actual;
      }),
    ),
    error: null,
  });
  const q = {
    select: (columns: string) => {
      mocks.select.push(columns);
      return q;
    },
    eq: (key: string, value: unknown) => {
      filters.push([key, value]);
      mocks.filters.push([table, key, value]);
      return q;
    },
    in: (key: string, value: unknown[]) => {
      filters.push([key, value]);
      mocks.filters.push([table, key, value]);
      return q;
    },
    update: (value: unknown) => {
      mocks.writes.push(value);
      return q;
    },
    order: () => q,
    limit: () => q,
    insert: (value: unknown) => {
      mocks.writes.push(value);
      return q;
    },
    single: async () => ({ ...result(), data: result().data[0] ?? null }),
    maybeSingle: async () => ({ ...result(), data: result().data[0] ?? null }),
    then: (resolve: (value: unknown) => unknown) =>
      Promise.resolve(result()).then(resolve),
  };
  return q;
}
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from: query }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => ({
        data: { user: mocks.user ? { id: mocks.user } : null },
        error: null,
      }),
    },
  }),
}));
vi.mock("@/lib/hosted-audio/server", () => ({
  HostedAudioHttpError: class extends Error {},
}));
vi.mock("@/lib/rate-limit", () => ({
  checkApiRateLimit: async () => ({ allowed: true }),
}));
import {
  GET as listVideos,
  POST as createVideo,
} from "@/app/api/studio/videos/route";
import { GET, PUT } from "@/app/api/studio/videos/[id]/route";
import { GET as catalogue } from "@/app/api/studio/videos/catalogue/route";
import { emptyVideo } from "./model";
const id = "11111111-1111-4111-8111-111111111111";
const updatedAt = "2026-09-29T12:00:00.000Z";
const context = { params: Promise.resolve({ id }) };
const req = (method = "GET", body?: unknown, origin = "http://localhost") =>
  new Request(`http://localhost/api/studio/videos/${id}`, {
    method,
    headers: { origin },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const clip = (kind: "audio" | "visual", mediaId: string) => ({
  id: kind,
  media: {
    id: mediaId,
    kind,
    source: kind === "audio" ? "hosted" : "visual",
    title: "Spoofed",
    attribution: "Wrong",
    durationMs: 999999,
  },
  startMs: 0,
  durationMs: 10000,
  sourceOffsetMs: 0,
  fadeInMs: 0,
  fadeOutMs: 0,
  paramValues: { INTENSITY: 0.5 },
});
const body = () => ({
  title: "Video",
  updatedAt,
  content: {
    ...emptyVideo(),
    audioClips: [clip("audio", "track")],
    visualClips: [clip("visual", "visual")],
  },
});
beforeEach(() => {
  mocks.user = "owner";
  mocks.filters = [];
  mocks.writes = [];
  mocks.select = [];
  mocks.rows = {
    videos: [
      {
        id,
        owner_id: "owner",
        title: "Video",
        updated_at: updatedAt,
        content: emptyVideo(),
        status: "draft",
        distribution_state: {},
        schedule_state: {},
      },
    ],
    music_artists: [{ id: "artist", name: "Artist", claimed_by: "owner" }],
    tracks: [
      {
        id: "track",
        title: "Track",
        music_artist_id: "artist",
        duration_ms: 30000,
        status: "live",
      },
    ],
    visualisations: [
      {
        id: "visual",
        title: "Visual",
        visibility: "protected",
        marketplace_price_credits: null,
        profiles: { username: "Creator" },
      },
    ],
  };
});
it("requires authentication and scopes reads to the owner", async () => {
  mocks.user = null;
  expect((await GET(req(), context)).status).toBe(401);
  expect((await PUT(req("PUT", body()), context)).status).toBe(401);
  expect((await catalogue()).status).toBe(401);
  mocks.user = "other";
  expect((await GET(req(), context)).status).toBe(404);
  expect(mocks.filters).toContainEqual(["videos", "owner_id", "other"]);
});
it("rejects cross-origin and malformed writes", async () => {
  expect(
    (await PUT(req("PUT", body(), "https://other.test"), context)).status,
  ).toBe(403);
  expect(
    (await PUT(req("PUT", { ...body(), content: {} }), context)).status,
  ).toBe(400);
  expect(mocks.writes).toEqual([]);
});
it("rejects tracks the artist does not control, private visuals and withdrawn tracks", async () => {
  mocks.rows.music_artists = [];
  expect((await PUT(req("PUT", body()), context)).status).toBe(403);
  mocks.rows.music_artists = [
    { id: "artist", name: "Artist", claimed_by: "owner" },
  ];
  Object.assign(mocks.rows.visualisations![0]!, { visibility: "private" });
  expect((await PUT(req("PUT", body()), context)).status).toBe(403);
  Object.assign(mocks.rows.visualisations![0]!, { visibility: "public" });
  Object.assign(mocks.rows.tracks![0]!, { status: "withdrawn" });
  expect((await PUT(req("PUT", body()), context)).status).toBe(403);
  expect(mocks.writes).toEqual([]);
});
it("checks authoritative duration and canonicalises attribution", async () => {
  const tooLong = body();
  tooLong.content.audioClips[0]!.durationMs = 50000;
  expect((await PUT(req("PUT", tooLong), context)).status).toBe(400);
  expect((await PUT(req("PUT", body()), context)).status).toBe(200);
  expect(mocks.writes[0]).toMatchObject({
    content: {
      audioClips: [
        { media: { title: "Track", attribution: "Artist", durationMs: 30000 } },
      ],
      visualClips: [
        {
          media: { title: "Visual", attribution: "Creator" },
          paramValues: { INTENSITY: 0.5 },
        },
      ],
    },
  });
  expect(mocks.filters).toContainEqual(["videos", "updated_at", updatedAt]);
  expect(mocks.filters).toContainEqual(["videos", "owner_id", "owner"]);
});
it("rejects a stale save without overwriting a newer revision", async () => {
  expect(
    (
      await PUT(
        req("PUT", { ...body(), updatedAt: "2026-09-28T00:00:00Z" }),
        context,
      )
    ).status,
  ).toBe(409);
});
it("allows free visuals and unlicensed priced products in drafts, and returns metadata only", async () => {
  for (const visibility of ["public", "protected", "product"]) {
    Object.assign(mocks.rows.visualisations![0]!, {
      visibility,
      marketplace_price_credits: visibility === "product" ? 5 : null,
    });
    expect((await PUT(req("PUT", body()), context)).status).toBe(200);
  }
  const response = await catalogue();
  const { items } = await response.json();
  expect(items[1]).toMatchObject({ distribution: "product", priceCredits: 5 });
  expect(items[1]).not.toHaveProperty("source");
  expect(
    mocks.select
      .filter((columns) => columns.includes("visibility"))
      .every((columns) => !columns.includes("source")),
  ).toBe(true);
  Object.assign(mocks.rows.visualisations![0]!, {
    marketplace_price_credits: null,
  });
  expect((await PUT(req("PUT", body()), context)).status).toBe(403);
});

it("scopes service-role collection reads and creates to the signed-in user", async () => {
  mocks.user = "other";
  const response = await listVideos();
  expect(await response.json()).toEqual({ videos: [] });
  expect(mocks.filters).toContainEqual(["videos", "owner_id", "other"]);
  mocks.user = "owner";
  expect((await createVideo(req("POST"))).status).toBe(200);
  expect(mocks.writes[0]).toEqual({
    owner_id: "owner",
    title: "Untitled video",
    content: emptyVideo(),
  });
  mocks.user = null;
  expect((await listVideos()).status).toBe(401);
  expect((await createVideo(req("POST"))).status).toBe(401);
});
