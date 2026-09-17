// @vitest-environment node
import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const rpc = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ rpc }) }));
import { completeAiGeneration } from "./guardrails";
it("passes the source for atomic success settlement", async () => {
  rpc.mockResolvedValue({ data: "completed", error: null });
  await expect(
    completeAiGeneration("id", "success", 2, "render {}"),
  ).resolves.toBeUndefined();
  expect(rpc).toHaveBeenLastCalledWith("complete_ai_generation", {
    p_request_id: "id",
    p_status: "success",
    p_attempts: 2,
    p_source: "render {}",
  });
});
it("reports expired credits as a clear no-charge failure", async () => {
  rpc.mockResolvedValue({ data: "credits_expired", error: null });
  await expect(
    completeAiGeneration("id", "success", 1, "render {}"),
  ).rejects.toThrow("No credits were charged");
});
