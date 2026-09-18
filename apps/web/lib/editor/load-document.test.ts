// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ user: vi.fn(), row: vi.fn(), eq: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: m.user },
    from: () => ({ select: () => ({ eq: m.eq }) }),
  }),
}));
import { GET } from "@/app/api/editor/[id]/route";
beforeEach(() => {
  m.eq.mockReturnValue({ maybeSingle: m.row });
  m.user.mockResolvedValue({ data: { user: { id: "owner" } } });
});
it("returns current RLS-visible content with no-store and verified ownership", async () => {
  m.row.mockResolvedValue({
    data: { source: "saved", owner_id: "owner" },
    error: null,
  });
  const response = await GET(new Request("http://localhost/api/editor/vis"), {
    params: Promise.resolve({ id: "vis" }),
  });
  expect(await response.json()).toEqual({
    visualisation: { source: "saved", owner_id: "owner" },
    canEdit: true,
  });
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(m.eq).toHaveBeenCalledWith("id", "vis");
});
it("does not allow editing another owner's public document", async () => {
  m.row.mockResolvedValue({
    data: { source: "public", owner_id: "other" },
    error: null,
  });
  const response = await GET(new Request("http://localhost/api/editor/vis"), {
    params: Promise.resolve({ id: "vis" }),
  });
  expect((await response.json()).canEdit).toBe(false);
});
it("returns a retryable error rather than a cached document on read failure", async () => {
  m.row.mockResolvedValue({
    data: null,
    error: { message: "database detail" },
  });
  const response = await GET(new Request("http://localhost/api/editor/vis"), {
    params: Promise.resolve({ id: "vis" }),
  });
  expect(response.status).toBe(503);
  expect(JSON.stringify(await response.json())).not.toContain(
    "database detail",
  );
});
