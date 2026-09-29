import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({
  user: "owner" as string | null,
  owned: true,
  writes: [] as unknown[],
  filters: [] as [string, string, unknown][],
  rows: [] as { set_id: string; selected_at: string }[],
}));
function query(table: string) {
  const result = () => ({
    data: table === "studio_sets" ? mocks.rows : [],
    error: null,
  });
  const q = {
    select: () => q,
    order: () => q,
    eq: (key: string, value: unknown) => {
      mocks.filters.push([table, key, value]);
      return q;
    },
    maybeSingle: async () => ({
      data: mocks.owned ? { id } : null,
      error: null,
    }),
    single: async () => ({ data: mocks.rows[0], error: null }),
    upsert: (row: { set_id: string }, options: unknown) => {
      mocks.writes.push([row, options]);
      if (!mocks.rows.length)
        mocks.rows.push({ ...row, selected_at: "2026-09-29T00:00:00Z" });
      return q;
    },
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
vi.mock("@/lib/rate-limit", () => ({
  checkApiRateLimit: async () => ({ allowed: true }),
}));
import { GET, POST } from "@/app/api/studio/sets/route";
const id = "a1700000-0000-4000-8000-000000000003";
const request = (
  method = "GET",
  input?: unknown,
  origin = "http://localhost",
) =>
  new Request("http://localhost/api/studio/sets", {
    method,
    headers: { origin },
    body: input === undefined ? undefined : JSON.stringify(input),
  });
beforeEach(() => {
  mocks.user = "owner";
  mocks.owned = true;
  mocks.rows = [];
  mocks.filters = [];
  mocks.writes = [];
});
it("authenticates and scopes both Sets and selections to their owner", async () => {
  mocks.user = null;
  expect((await GET(request())).status).toBe(401);
  expect((await POST(request("POST", { setId: id }))).status).toBe(401);
  mocks.user = "owner";
  expect((await GET(request())).status).toBe(200);
  expect(mocks.filters).toContainEqual([
    "performance_sets",
    "owner_id",
    "owner",
  ]);
  expect(mocks.filters).toContainEqual([
    "studio_sets",
    "performance_sets.owner_id",
    "owner",
  ]);
});
it("rejects another user's Set, invalid IDs and cross-origin writes", async () => {
  mocks.owned = false;
  expect((await POST(request("POST", { setId: id }))).status).toBe(404);
  expect((await POST(request("POST", { setId: "invalid" }))).status).toBe(404);
  expect(
    (await POST(request("POST", { setId: id }, "https://elsewhere.test")))
      .status,
  ).toBe(403);
  expect(mocks.writes).toEqual([]);
});
it("selects only the Set ID, ignores client ownership/content and handles repeated selection", async () => {
  const first = await POST(
    request("POST", {
      setId: id,
      ownerId: "other",
      content: { name: "spoofed" },
    }),
  );
  const second = await POST(request("POST", { setId: id }));
  expect(first.status).toBe(200);
  expect(await second.json()).toEqual(await first.json());
  expect(mocks.rows).toHaveLength(1);
  expect(mocks.writes[0]).toEqual([
    { set_id: id },
    { onConflict: "set_id", ignoreDuplicates: true },
  ]);
  expect(mocks.filters).toContainEqual([
    "performance_sets",
    "owner_id",
    "owner",
  ]);
});
