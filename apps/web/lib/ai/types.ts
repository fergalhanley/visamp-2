export const AI_MODEL_OPTIONS = [
  { key: "anthropic", label: "Claude (Anthropic)" },
  { key: "openai", label: "ChatGPT (OpenAI)" },
  { key: "qwen", label: "Qwen 3.8 (Alibaba)" },
] as const;

export type AiModelKey = (typeof AI_MODEL_OPTIONS)[number]["key"];

export function isAiModelKey(value: unknown): value is AiModelKey {
  return AI_MODEL_OPTIONS.some((option) => option.key === value);
}

export type GenerationEvent =
  | { type: "status"; message: string; level?: "info" | "warn" | "error" }
  | { type: "success"; source: string; message: string }
  | { type: "exhausted"; source: string; diagnostics: string; message: string }
  | { type: "error"; message: string };
