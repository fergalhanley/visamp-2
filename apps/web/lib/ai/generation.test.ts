// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const m = vi.hoisted(() => ({
  call: vi.fn(),
  charge: vi.fn(),
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
  chargeAiRepair: m.charge,
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
function request(extra: Record<string, unknown> = {}) {
  return new Request("http://localhost/api/ai/generate", {
    method: "POST",
    body: JSON.stringify({
      prompt: "draw",
      source: "render {}",
      visId: "vis",
      ...extra,
    }),
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  m.call.mockReset().mockResolvedValue("render { draw::clear() }");
  m.validate.mockReset().mockResolvedValue({ ok: true });
  m.admit.mockResolvedValue({ allowed: true, requestId: "request" });
  m.charge.mockReset().mockResolvedValue(undefined);
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
  expect(m.complete).toHaveBeenCalledExactlyOnceWith(
    "request",
    "exhausted",
    2,
    undefined,
  );
});
it("does not deliver success if settlement fails", async () => {
  m.complete.mockRejectedValueOnce(new Error("Settlement unavailable"));
  const response = await POST(request());
  const body = await response.text();
  expect(body).not.toContain('"type":"success"');
  expect(body).toContain('"type":"error"');
  expect(m.complete).toHaveBeenLastCalledWith("request", "error", 1, undefined);
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
  expect(m.complete).toHaveBeenCalledExactlyOnceWith(
    "request",
    "error",
    1,
    undefined,
  );
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

it("uses Sol then Astra, capped at two regardless of legacy attempt settings", async () => {
  m.validate.mockResolvedValue({ ok: false, diagnostic: "Unknown function" });
  const response = await POST(request());
  await response.text();
  expect(m.call.mock.calls.map((args) => args[2])).toEqual([
    "gpt-5.6-sol",
    "gpt-6-astra",
  ]);
  expect(m.charge).not.toHaveBeenCalled();
});
it("falls back to Astra after a Sol provider failure", async () => {
  m.call.mockRejectedValueOnce(new Error("Unavailable"));
  const response = await POST(request());
  expect(await response.text()).toContain('"type":"success"');
  expect(m.call.mock.calls.map((args) => args[2])).toEqual([
    "gpt-5.6-sol",
    "gpt-6-astra",
  ]);
});
it.each(["success", "exhausted", "error"])(
  "charges a repair before its only model call, including %s outcomes",
  async (outcome) => {
    if (outcome === "exhausted")
      m.validate.mockResolvedValue({ ok: false, diagnostic: "Still invalid" });
    if (outcome === "error")
      m.call.mockRejectedValue(new Error("Model unavailable"));
    const response = await POST(
      request({
        mode: "repair",
        diagnostics: "Unknown function",
        expectedCost: 100,
      }),
    );
    const events = (await response.text())
      .trim()
      .split("\n")
      .map((s) => JSON.parse(s));
    expect(events.at(-1).type).toBe(outcome);
    expect(m.charge).toHaveBeenCalledExactlyOnceWith("request", 100);
    expect(m.charge.mock.invocationCallOrder[0]).toBeLessThan(
      m.call.mock.invocationCallOrder[0]!,
    );
    expect(m.call).toHaveBeenCalledExactlyOnceWith(
      expect.arrayContaining([
        expect.objectContaining({
          content: expect.stringContaining("Unknown function"),
        }),
      ]),
      expect.any(AbortSignal),
      "gpt-6-astra",
    );
    expect(m.complete).toHaveBeenCalledExactlyOnceWith(
      "request",
      outcome,
      1,
      outcome === "error" ? "render {}" : "render { draw::clear() }",
    );
  },
);
it("does not call the model when the repair quote cannot be charged", async () => {
  m.charge.mockRejectedValue(new Error("Price changed"));
  const response = await POST(
    request({ mode: "repair", diagnostics: "Invalid", expectedCost: 100 }),
  );
  expect(await response.text()).toContain("Price changed");
  expect(m.call).not.toHaveBeenCalled();
});
it.each([
  { mode: "repair" },
  { mode: "repair", diagnostics: "Invalid", expectedCost: -1 },
  { mode: "free-repair" },
])("rejects invalid repair input before admission: %j", async (input) => {
  expect((await POST(request(input))).status).toBe(400);
  expect(m.admit).not.toHaveBeenCalled();
});
it("keeps a paid repair charged on client cancellation without calling another model", async () => {
  const controller = new AbortController();
  m.call.mockImplementationOnce(async () => {
    controller.abort();
    throw new DOMException("Cancelled", "AbortError");
  });
  const response = await POST(new Request(request({ mode: "repair", diagnostics: "Invalid", expectedCost: 100 }), { signal: controller.signal }));
  await response.text();
  expect(m.charge).toHaveBeenCalledExactlyOnceWith("request", 100);
  expect(m.call).toHaveBeenCalledTimes(1);
  expect(m.complete).toHaveBeenCalledExactlyOnceWith("request", "aborted", 1, "render {}");
});
