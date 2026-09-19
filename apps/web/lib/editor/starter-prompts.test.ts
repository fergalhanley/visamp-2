import { afterEach, expect, it, vi } from "vitest";
import { createStarterPrompt, starterPromptTemplates } from "./starter-prompts";
afterEach(() => vi.restoreAllMocks());
it("offers ten distinct title-inspired, audio-reactive prompts", () => {
  expect(starterPromptTemplates).toHaveLength(10);
  const prompts = starterPromptTemplates.map((_, index) => {
    vi.spyOn(Math, "random").mockReturnValue((index + 0.5) / 10);
    const prompt = createStarterPrompt("Strobe Velvet Pumpkin");
    expect(prompt).toContain('"Strobe Velvet Pumpkin"');
    expect(prompt).toContain("2D or 3D");
    expect(prompt).toMatch(/audio|sound spectrum/);
    expect(prompt).not.toContain("{title}");
    return prompt;
  });
  expect(new Set(prompts).size).toBe(10);
});
it("inserts titles literally rather than treating them as replacement syntax", () => {
  expect(createStarterPrompt("Strobe $& Pumpkin")).toContain(
    '"Strobe $& Pumpkin"',
  );
});
