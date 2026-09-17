// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("node:fs/promises", () => ({
  readFile: vi.fn().mockResolvedValue("reference"),
}));
import { callModel } from "./server";
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
it("uses Sol regardless of obsolete model settings", async () => {
  vi.stubEnv("OPENAI_API_KEY", "test-key");
  vi.stubEnv("AI_OPENAI_MODEL", "obsolete-model");
  const fetch = vi
    .fn()
    .mockResolvedValue(
      Response.json({
        output: [{ content: [{ type: "output_text", text: "render {}" }] }],
      }),
    );
  vi.stubGlobal("fetch", fetch);
  expect(await callModel([{ role: "user", content: "Draw waves" }])).toBe(
    "render {}",
  );
  const body = JSON.parse(fetch.mock.calls[0]![1].body);
  expect(body.model).toBe("gpt-5.6-sol");
  expect(body.store).toBe(false);
  expect(fetch.mock.calls[0]![0]).toBe("https://api.openai.com/v1/responses");
});
it("reports unavailable OpenAI with no fallback request", async () => {
  vi.stubEnv("OPENAI_API_KEY", "test-key");
  const fetch = vi
    .fn()
    .mockResolvedValue(
      Response.json({ error: { message: "Unavailable" } }, { status: 503 }),
    );
  vi.stubGlobal("fetch", fetch);
  await expect(
    callModel([{ role: "user", content: "Draw waves" }]),
  ).rejects.toThrow("Unavailable");
  expect(fetch).toHaveBeenCalledTimes(1);
});
