// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const m = vi.hoisted(() => ({
  call: vi.fn(),
  validate: vi.fn(),
  admit: vi.fn(),
  complete: vi.fn(),
}));
vi.mock("@/lib/ai/server", () => ({
  callModel: m.call,
  extractScript: (s: string) => s,
  validateRender: m.validate,
}));
vi.mock("@/lib/ai/guardrails", () => ({
  aiGenerationEnabled: () => true,
  admitAiGeneration: m.admit,
  completeAiGeneration: m.complete,
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "owner" } } }) },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: { id: "vis", owner_id: "owner" } }),
        }),
      }),
    }),
  }),
}));
import { POST } from "@/app/api/ai/generate/route";
function request() {
  return new Request("http://localhost/api/ai/generate", {
    method: "POST",
    body: JSON.stringify({ prompt: "draw", source: "render {}", visId: "vis" }),
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  m.call.mockReset().mockResolvedValue("render { draw::clear() }");
  m.validate.mockReset().mockResolvedValue({ ok: true });
  m.admit.mockResolvedValue({ allowed: true, requestId: "request" });
  m.complete.mockReset().mockResolvedValue(undefined);
});
it("settles and saves exactly once before delivering validated code", async () => {
  m.validate.mockResolvedValueOnce({ ok: false, diagnostic: "Fix it" });
  const response = await POST(request());
  const events = (await response.text())
    .trim()
    .split("\n")
    .map((s) => JSON.parse(s));
  expect(events.at(-1).type).toBe("success");
  expect(m.call).toHaveBeenCalledTimes(2);
  expect(m.complete).toHaveBeenCalledExactlyOnceWith(
    "request",
    "success",
    2,
    "render { draw::clear() }",
  );
});
it("failed validation releases reservations without a successful charge", async () => {
  m.validate.mockResolvedValue({ ok: false, diagnostic: "Invalid" });
  const response = await POST(request());
  expect(await response.text()).toContain('"type":"exhausted"');
  expect(m.complete).toHaveBeenCalledExactlyOnceWith("request", "exhausted", 3);
});
it("does not deliver success if settlement fails", async () => {
  m.complete.mockRejectedValueOnce(new Error("Settlement unavailable"));
  const response = await POST(request());
  const body = await response.text();
  expect(body).not.toContain('"type":"success"');
  expect(body).toContain('"type":"error"');
  expect(m.complete).toHaveBeenLastCalledWith("request", "error", 1);
});
it("insufficient credits never invoke the model", async () => {
  m.admit.mockResolvedValue({
    allowed: false,
    reason: "insufficient_credit",
    retryAfterSeconds: 3600,
  });
  expect((await POST(request())).status).toBe(402);
  expect(m.call).not.toHaveBeenCalled();
});
it("preserves generated code when the validator cannot be reached", async () => {
  m.validate.mockRejectedValue(new Error("fetch failed"));
  const response = await POST(request());
  const events = (await response.text())
    .trim()
    .split("\n")
    .map((s) => JSON.parse(s));
  expect(events).toContainEqual({
    type: "attempt",
    source: "render { draw::clear() }",
  });
  expect(events.at(-1)).toEqual({
    type: "error",
    source: "render { draw::clear() }",
    message: "fetch failed",
  });
  expect(m.complete).toHaveBeenCalledExactlyOnceWith("request", "error", 1);
});
it("does not offer code when the model fails before producing an attempt", async () => {
  m.call.mockRejectedValue(new Error("Model unavailable"));
  const response = await POST(request());
  const events = (await response.text())
    .trim()
    .split("\n")
    .map((s) => JSON.parse(s));
  expect(events.at(-1)).toEqual({
    type: "error",
    message: "Model unavailable",
  });
});
