// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  create: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: mocks.user } }),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => ({
      insert: mocks.insert,
      update: () => ({ eq: mocks.update }),
    }),
  }),
}));
vi.mock("@/lib/billing/stripe", () => ({
  stripeLiveMode: () => false,
  stripeClient: () => ({ checkout: { sessions: { create: mocks.create } } }),
}));
import { POST } from "@/app/api/billing/checkout/route";
function request(body: unknown, origin = "https://visamp.io") {
  return new Request("https://visamp.io/api/billing/checkout", {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.user.mockResolvedValue({
    data: { user: { id: "owner", email: "owner@example.invalid" } },
  });
  mocks.insert.mockResolvedValue({ error: null });
  mocks.update.mockResolvedValue({ error: null });
  mocks.create.mockResolvedValue({
    id: "cs_test",
    url: "https://checkout.stripe.com/test",
    livemode: false,
  });
});
it("binds purchase to authenticated user and server-calculated credit amount", async () => {
  const r = await POST(
    request({ amount: "5", user_id: "attacker", credits: 9999999 }),
  );
  expect(r.status).toBe(200);
  expect(mocks.insert).toHaveBeenCalledWith(
    expect.objectContaining({
      user_id: "owner",
      amount_cents: 500,
      credits: 5000,
      credits_per_usd: 1000,
      livemode: false,
    }),
  );
  expect(mocks.create).toHaveBeenCalledWith(
    expect.objectContaining({
      mode: "payment",
      line_items: [
        expect.objectContaining({
          price_data: expect.objectContaining({
            unit_amount: 500,
            currency: "usd",
          }),
        }),
      ],
    }),
    expect.objectContaining({ idempotencyKey: expect.any(String) }),
  );
});
it("rejects below-minimum and malformed money before Stripe", async () => {
  expect((await POST(request({ amount: "1.99" }))).status).toBe(400);
  expect((await POST(request({ amount: "2.001" }))).status).toBe(400);
  expect(mocks.create).not.toHaveBeenCalled();
});
it("rejects cross-site and unauthenticated purchases", async () => {
  expect(
    (await POST(request({ amount: "5" }, "https://evil.invalid"))).status,
  ).toBe(403);
  mocks.user.mockResolvedValue({ data: { user: null } });
  expect((await POST(request({ amount: "5" }))).status).toBe(401);
  expect(mocks.insert).not.toHaveBeenCalled();
});
