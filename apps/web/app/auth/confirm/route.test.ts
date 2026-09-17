// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";

const auth = vi.hoisted(() => ({
  exchangeCodeForSession: vi.fn(),
  verifyOtp: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth }),
}));
beforeEach(() => {
  vi.clearAllMocks();
  auth.exchangeCodeForSession.mockResolvedValue({ error: null });
  auth.verifyOtp.mockResolvedValue({ error: null });
});
const request = (params: Record<string, string>) =>
  new NextRequest(
    `https://www.visamp.io/auth/confirm?${new URLSearchParams(params)}`,
  );
describe("email confirmation", () => {
  it("exchanges default-template PKCE codes and preserves the return path", async () => {
    const response = await GET(
      request({ code: "test-code", next: "/vis/example" }),
    );
    expect(auth.exchangeCodeForSession).toHaveBeenCalledWith("test-code");
    expect(auth.verifyOtp).not.toHaveBeenCalled();
    expect(response.headers.get("location")).toBe(
      "https://www.visamp.io/vis/example",
    );
  });
  it("supports custom token-hash templates", async () => {
    const response = await GET(
      request({ token_hash: "test-hash", type: "email" }),
    );
    expect(auth.verifyOtp).toHaveBeenCalledWith({
      token_hash: "test-hash",
      type: "email",
    });
    expect(response.headers.get("location")).toBe("https://www.visamp.io/");
  });
  it("reports missing tokens and rejected codes", async () => {
    expect((await GET(request({}))).headers.get("location")).toContain(
      "reason=missing_token",
    );
    expect(auth.exchangeCodeForSession).not.toHaveBeenCalled();
    auth.exchangeCodeForSession.mockResolvedValueOnce({
      error: { message: "Expired code" },
    });
    expect(
      (await GET(request({ code: "expired" }))).headers.get("location"),
    ).toContain("reason=Expired%20code");
  });
  it.each([
    "https://example.com",
    "//example.com",
    "/\\example.com",
    "/\n/example.com",
  ])("rejects unsafe return path %s", async (next) => {
    expect(
      (await GET(request({ code: "code", next }))).headers.get("location"),
    ).toBe("https://www.visamp.io/");
  });
});
