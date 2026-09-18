// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  rpc: vi.fn(),
  receipt: { environment: "staging" } as { environment: string } | null,
}));
vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ rpc: state.rpc }),
}));
import { flushAnalytics, registerOperation, serverEvent } from "./server";
const receipt = "12345678-1234-1234-1234-123456789012";
const item = {
  id: "purchase:test",
  receipt,
  user_id: "user",
  event: "credits_purchased",
  properties: { credits: 500, email: "secret@example.com" },
  occurred_at: "2026-09-18T10:00:00Z",
  environment: "staging",
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("VERCEL_ENV", "development");
  state.receipt = { environment: "staging" };
  state.rpc.mockImplementation(async (_name, args) => ({
    data:
      args.p_action === "pending"
        ? [item]
        : args.p_action === "active"
          ? state.receipt
          : {},
    error: null,
  }));
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: 1 }) }),
  );
});
it("does not record server outcomes without a consent receipt", async () => {
  await serverEvent(
    new Request("http://localhost/api"),
    "user",
    "artist_created",
    {},
  );
  expect(state.rpc).not.toHaveBeenCalled();
});
it("rejects production receipts on local/test requests", async () => {
  state.receipt = { environment: "production" };
  await registerOperation(
    new Request("http://localhost/api", {
      headers: { cookie: `visamp_analytics_receipt=${receipt}` },
    }),
    "user",
    "operation",
    "generation",
  );
  expect(state.rpc.mock.calls.map((call) => call[1].p_action)).toEqual([
    "active",
  ]);
});
it("retries preserve original IDs and timestamps and remove non-allowlisted properties", async () => {
  await flushAnalytics();
  await flushAnalytics();
  const first = JSON.parse(
    vi.mocked(fetch).mock.calls[0]![1]!.body as string,
  )[0];
  const second = JSON.parse(
    vi.mocked(fetch).mock.calls[1]![1]!.body as string,
  )[0];
  expect(first).toEqual(second);
  expect(first.properties.$insert_id).toBe("purchase:test");
  expect(first.properties.time).toBe(Date.parse(item.occurred_at) / 1000);
  expect(first.properties.email).toBeUndefined();
  expect(first.properties.environment).toBe("staging");
});
it("does not acknowledge failed ingestion", async () => {
  vi.mocked(fetch).mockResolvedValueOnce({
    ok: true,
    json: async () => ({ status: 0 }),
  } as Response);
  await expect(flushAnalytics()).rejects.toThrow("Analytics ingestion failed");
  expect(
    state.rpc.mock.calls.some((call) => call[1].p_action === "delivered"),
  ).toBe(false);
});
it("rechecks withdrawal immediately before delivery", async () => {
  state.receipt = null;
  await flushAnalytics();
  expect(fetch).not.toHaveBeenCalled();
});
