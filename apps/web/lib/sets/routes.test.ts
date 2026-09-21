import { beforeEach, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({
  user: "owner" as string | null,
  filters: [] as [string, unknown][],
  rows: [] as unknown[],
  error: null as unknown,
}));
const query = () => {
  const q = {
    select: () => q,
    order: async () => ({ data: mocks.rows, error: mocks.error }),
    eq: (k: string, v: unknown) => {
      mocks.filters.push([k, v]);
      return q;
    },
    maybeSingle: async () => ({
      data: mocks.rows[0] ?? null,
      error: mocks.error,
    }),
    single: async () => ({ data: mocks.rows[0] ?? null, error: mocks.error }),
    insert: () => q,
    update: () => q,
    delete: () => q,
    then: (resolve: (v: unknown) => unknown) =>
      Promise.resolve(resolve({ error: mocks.error })),
  };
  return q;
};
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from: () => query() }),
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
import { GET, PUT, DELETE } from "@/app/api/sets/[id]/route";
import { POST } from "@/app/api/sets/route";
import { emptySet } from "./model";
const id = "11111111-1111-4111-8111-111111111111";
const ctx = { params: Promise.resolve({ id }) };
const req = (method = "GET", body?: unknown, origin = "http://localhost") =>
  new Request(`http://localhost/api/sets/${id}`, {
    method,
    headers: { origin, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
beforeEach(() => {
  mocks.user = "owner";
  mocks.filters = [];
  mocks.rows = [];
  mocks.error = null;
});
it("requires authentication for reads and writes", async () => {
  mocks.user = null;
  expect((await GET(req(), ctx)).status).toBe(401);
  expect((await PUT(req("PUT", {}), ctx)).status).toBe(401);
});
it("scopes reads/deletes to current owner and hides missing sets", async () => {
  expect((await GET(req(), ctx)).status).toBe(404);
  expect(mocks.filters).toContainEqual(["owner_id", "owner"]);
  mocks.filters = [];
  expect((await DELETE(req("DELETE"), ctx)).status).toBe(200);
  expect(mocks.filters).toContainEqual(["owner_id", "owner"]);
});
it("rejects cross-origin mutations and malformed content", async () => {
  expect((await POST(req("POST", {}, "https://other.example"))).status).toBe(
    403,
  );
  expect((await POST(req("POST", null))).status).toBe(400);
  expect(
    (await PUT(req("PUT", { content: {}, updatedAt: "x" }), ctx)).status,
  ).toBe(400);
});
it("uses optimistic concurrency and does not overwrite newer edits", async () => {
  expect(
    (await PUT(req("PUT", { content: emptySet(), updatedAt: "old" }), ctx))
      .status,
  ).toBe(409);
  expect(mocks.filters).toContainEqual(["updated_at", "old"]);
  expect(mocks.filters).toContainEqual(["owner_id", "owner"]);
});
it("returns server timing validation for repairable drafts", async () => {
  const content = emptySet();
  mocks.rows = [
    { id, owner_id: "owner", content, created_at: "now", updated_at: "now" },
  ];
  const r = await PUT(req("PUT", { content, updatedAt: "old" }), ctx);
  expect(r.status).toBe(200);
  expect((await r.json()).validation).toHaveLength(2);
});
it("cannot duplicate another owner set", async () => {
  expect((await POST(req("POST", { duplicateId: id }))).status).toBe(404);
  expect(mocks.filters).toContainEqual(["owner_id", "owner"]);
});
