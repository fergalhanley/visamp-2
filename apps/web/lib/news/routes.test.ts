// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  db: vi.fn(),
  publicDb: vi.fn(),
}));
vi.mock("@/lib/hosted-audio/admin", () => ({
  requireAdmin: mocks.auth,
  AdminAuthorizationError: class extends Error {
    constructor(
      public status: number,
      message: string,
    ) {
      super(message);
    }
  },
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.db }));
vi.mock("@/lib/supabase/public", () => ({
  createPublicClient: mocks.publicDb,
}));
import { AdminAuthorizationError } from "@/lib/hosted-audio/admin";
import { GET, POST } from "@/app/api/admin/news/route";
import { PATCH } from "@/app/api/admin/news/[id]/route";
import { POST as upload } from "@/app/api/admin/news/[id]/images/route";
import { GET as image } from "@/app/api/news/images/[id]/[file]/route";
import { parseNewsInput } from "./types";
const id = "00000000-0000-0000-0000-000000000001";
const params = { params: Promise.resolve({ id }) };
const imageParams = { params: Promise.resolve({ id, file: id + ".webp" }) };
beforeEach(() => vi.resetAllMocks());
describe("news access", () => {
  for (const status of [401, 403] as const)
    it(`denies ${status} before any admin data access`, async () => {
      mocks.auth.mockRejectedValue(
        new AdminAuthorizationError(status, "Denied"),
      );
      expect(
        (await GET(new Request("http://localhost/api/admin/news"))).status,
      ).toBe(status);
      expect(
        (
          await POST(
            new Request("http://localhost/api/admin/news", { method: "POST" }),
          )
        ).status,
      ).toBe(status);
      expect(
        (
          await PATCH(
            new Request("http://localhost/api/admin/news/x", {
              method: "PATCH",
            }),
            params,
          )
        ).status,
      ).toBe(status);
      expect(
        (
          await upload(
            new Request("http://localhost/api/admin/news/x/images", {
              method: "POST",
            }),
            params,
          )
        ).status,
      ).toBe(status);
      expect(mocks.db).not.toHaveBeenCalled();
    });
  it("rejects foreign origins and invalid publishing input", async () => {
    mocks.auth.mockResolvedValue({ userId: id });
    expect(
      (
        await POST(
          new Request("http://localhost/api/admin/news", {
            method: "POST",
            headers: { Origin: "https://other.example" },
          }),
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await POST(
          new Request("http://localhost/api/admin/news", {
            method: "POST",
            body: JSON.stringify({
              title: "Post",
              body: "",
              status: "published",
            }),
          }),
        )
      ).status,
    ).toBe(400);
    expect(mocks.db).not.toHaveBeenCalled();
  });
  it("hides draft images from non-admins", async () => {
    const query = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    };
    mocks.publicDb.mockReturnValue({ from: () => query });
    mocks.auth.mockRejectedValue(new AdminAuthorizationError(401, "Denied"));
    const result = await image(
      new Request("http://localhost/image"),
      imageParams,
    );
    expect(result.status).toBe(404);
    expect(mocks.db).not.toHaveBeenCalled();
  });
  it("serves published images without long-lived caching", async () => {
    const query = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: { id }, error: null }),
    };
    mocks.publicDb.mockReturnValue({ from: () => query });
    mocks.db.mockReturnValue({
      storage: {
        from: () => ({
          download: vi
            .fn()
            .mockResolvedValue({ data: new Blob(["image"]), error: null }),
        }),
      },
    });
    const result = await image(
      new Request("http://localhost/image"),
      imageParams,
    );
    expect(result.status).toBe(200);
    expect(result.headers.get("Cache-Control")).toContain("no-store");
    expect(mocks.auth).not.toHaveBeenCalled();
  });
  it("detects concurrent saves", async () => {
    mocks.auth.mockResolvedValue({ userId: id });
    const query = {
      select: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi
        .fn()
        .mockResolvedValueOnce({ data: { published_at: null } })
        .mockResolvedValueOnce({ data: null }),
    };
    mocks.db.mockReturnValue({ from: () => query });
    const result = await PATCH(
      new Request("http://localhost/api/admin/news/x", {
        method: "PATCH",
        body: JSON.stringify({
          title: "Post",
          body: "Content",
          status: "published",
          updated_at: "2026-09-20T00:00:00Z",
        }),
      }),
      params,
    );
    expect(result.status).toBe(409);
  });
});
describe("news validation", () => {
  it("allows empty drafts but requires content to publish", () => {
    expect(
      parseNewsInput({ title: " Draft ", body: "", status: "draft" }).title,
    ).toBe("Draft");
    expect(() =>
      parseNewsInput({ title: "Draft", body: " ", status: "published" }),
    ).toThrow();
    expect(() =>
      parseNewsInput({ title: "x", body: "x".repeat(50001), status: "draft" }),
    ).toThrow();
    expect(() => parseNewsInput(null)).toThrow();
  });
});
