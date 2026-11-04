import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const m = vi.hoisted(() => ({
  user: "owner" as string | null,
  sets: [] as Record<string, unknown>[],
  distributions: [] as Record<string, unknown>[],
}));
function query(table: string) {
  const filters: [string, unknown][] = [];
  let update: Record<string, unknown> | undefined;
  let upsert: Record<string, unknown> | undefined;
  const result = () => {
    const source = table === "performance_sets" ? m.sets : m.distributions;
    if (
      upsert &&
      !source.some(
        (r) => r.set_id === upsert!.set_id && r.target === upsert!.target,
      )
    )
      source.push({
        id: distributionId,
        status: "draft",
        created_at: now,
        updated_at: now,
        ...upsert,
      });
    const rows = source.filter((row) =>
      filters.every(([key, value]) => {
        const actual =
          key === "performance_sets.owner_id"
            ? m.sets.find((set) => set.id === row.set_id)?.owner_id
            : row[key];
        return actual === value;
      }),
    );
    if (update)
      rows.forEach((row) =>
        Object.assign(row, update, { updated_at: "2026-09-30T01:00:00Z" }),
      );
    return { data: rows, error: null };
  };
  const q = {
    select: () => q,
    order: () => q,
    eq: (key: string, value: unknown) => {
      filters.push([key, value]);
      return q;
    },
    upsert: (value: Record<string, unknown>) => {
      upsert = value;
      return q;
    },
    update: (value: Record<string, unknown>) => {
      update = value;
      return q;
    },
    single: async () => {
      const r = result();
      return { ...r, data: r.data[0] };
    },
    maybeSingle: async () => {
      const r = result();
      return { ...r, data: r.data[0] ?? null };
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
        data: { user: m.user ? { id: m.user } : null },
        error: null,
      }),
    },
  }),
}));
vi.mock("@/lib/rate-limit", () => ({
  checkApiRateLimit: async () => ({ allowed: true }),
}));
import { GET, POST } from "@/app/api/studio/distributions/route";
import { PUT } from "@/app/api/studio/distributions/[id]/route";
import { defaultMasterSettings } from "./distributions-model";
const setId = "11111111-1111-4111-8111-111111111111";
const distributionId = "22222222-2222-4222-8222-222222222222";
const now = "2026-09-30T00:00:00Z";
const context = { params: Promise.resolve({ id: distributionId }) };
const req = (method = "GET", body?: unknown, origin = "http://localhost") =>
  new Request("http://localhost/api/studio/distributions", {
    method,
    headers: { origin },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const create = () => POST(req("POST", { setId, target: "master_download" }));
beforeEach(() => {
  m.user = "owner";
  m.sets = [{ id: setId, owner_id: "owner", content: { name: "Master" } }];
  m.distributions = [];
});
it("requires authentication and same-origin writes", async () => {
  m.user = null;
  expect((await GET(req())).status).toBe(401);
  expect((await create()).status).toBe(401);
  expect((await PUT(req("PUT", {}), context)).status).toBe(401);
  m.user = "owner";
  expect(
    (
      await POST(
        req("POST", { setId, target: "master_download" }, "https://other.test"),
      )
    ).status,
  ).toBe(403);
});
it("hides other users' distributions and prevents creation or update against their Sets", async () => {
  await create();
  m.user = "other";
  expect(await (await GET(req())).json()).toEqual({ distributions: [] });
  expect((await create()).status).toBe(404);
  expect(
    (
      await PUT(
        req("PUT", {
          settings: defaultMasterSettings("Forged"),
          updatedAt: now,
        }),
        context,
      )
    ).status,
  ).toBe(404);
  expect(m.distributions[0]!.settings).toEqual(defaultMasterSettings("Master"));
});
it("creates one draft, retains saved settings on repeated adds, and rejects social targets", async () => {
  const first = await (await create()).json();
  expect(first.distribution).toMatchObject({
    setId,
    target: "master_download",
    status: "draft",
  });
  const settings = { ...defaultMasterSettings("Edited"), resolution: "720p" };
  expect(
    (await PUT(req("PUT", { settings, updatedAt: now }), context)).status,
  ).toBe(200);
  const second = await (await create()).json();
  expect(second.distribution.settings).toEqual(settings);
  expect(m.distributions).toHaveLength(1);
  expect((await POST(req("POST", { setId, target: "youtube" }))).status).toBe(
    400,
  );
});
it("validates settings and rejects stale saves without losing the saved setup", async () => {
  await create();
  expect(
    (
      await PUT(
        req("PUT", {
          settings: { ...defaultMasterSettings("Bad"), format: "gif" },
          updatedAt: now,
        }),
        context,
      )
    ).status,
  ).toBe(400);
  expect(
    (
      await PUT(
        req("PUT", {
          settings: defaultMasterSettings("Stale"),
          updatedAt: "2026-09-29T00:00:00Z",
        }),
        context,
      )
    ).status,
  ).toBe(409);
  expect(m.distributions[0]!.settings).toEqual(defaultMasterSettings("Master"));
});
it("ignores forged status, target, Set and output fields on settings updates", async () => {
  await create();
  const response = await PUT(
    req("PUT", {
      settings: defaultMasterSettings("Valid"),
      updatedAt: now,
      target: "youtube",
      status: "ready",
      setId: "other",
      downloadUrl: "https://other.test",
    }),
    context,
  );
  expect(response.status).toBe(200);
  expect((await response.json()).distribution).toMatchObject({
    target: "master_download",
    status: "draft",
    setId,
  });
  expect(m.distributions[0]).not.toHaveProperty("downloadUrl");
});
