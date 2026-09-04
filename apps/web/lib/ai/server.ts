import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";

interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
}

interface AnthropicResponse {
  content?: Array<{ type: string; text?: string }>;
  error?: { message?: string };
}

interface ValidationResponse {
  ok?: boolean;
  error?: string;
  checks?: Record<string, { enabled: boolean; passed: boolean; value?: number }>;
}

let referencePromise: Promise<string> | undefined;

async function dslReference() {
  referencePromise ??= Promise.all([
    readFile(path.resolve(process.cwd(), "../../packages/engine/visamp_dsl.pest"), "utf8"),
    readFile(path.resolve(process.cwd(), "../docs/src/examples/basic.md"), "utf8"),
    readFile(path.resolve(process.cwd(), "../docs/src/examples/animation.md"), "utf8"),
    readFile(path.resolve(process.cwd(), "../docs/src/programming/system-values.md"), "utf8"),
    readFile(path.resolve(process.cwd(), "../docs/src/effects/filters.md"), "utf8"),
  ]).then(([grammar, basic, animation, systemValues, filters]) =>
    [
      "You generate VisAmp DSL code. Return only the complete DSL script, with no explanation.",
      "Preserve useful behavior from the current script unless the instruction asks to replace it.",
      "The result must include exactly one render block and must visibly respond to audio when requested.",
      "Grammar:",
      grammar,
      "Examples and language reference:",
      basic,
      animation,
      systemValues,
      filters,
    ].join("\n\n"),
  );
  return referencePromise;
}

export async function callModel(messages: ConversationMessage[]) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const model = process.env.AI_STANDARD_MODEL;
  if (!apiKey || !model) {
    throw new Error("AI generation is not configured (ANTHROPIC_API_KEY and AI_STANDARD_MODEL)");
  }

  const baseUrl = process.env.ANTHROPIC_BASE_URL ?? "https://api.anthropic.com";
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-api-key": apiKey,
    "anthropic-version": "2023-06-01",
  };
  const workspaceId = process.env.ANTHROPIC_WORKSPACE_ID?.trim();
  if (workspaceId) headers["anthropic-workspace-id"] = workspaceId;

  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/v1/messages`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model,
      max_tokens: Number(process.env.AI_MAX_OUTPUT_TOKENS ?? 8192),
      system: await dslReference(),
      messages,
    }),
    signal: AbortSignal.timeout(Number(process.env.AI_MODEL_TIMEOUT_MS ?? 60_000)),
  });
  const payload = (await response.json()) as AnthropicResponse;
  if (!response.ok) throw new Error(payload.error?.message ?? `Model request failed (${response.status})`);
  const text = payload.content
    ?.filter((block) => block.type === "text")
    .map((block) => block.text ?? "")
    .join("\n")
    .trim();
  if (!text) throw new Error("The model returned no code");
  return text;
}

export function extractScript(response: string) {
  const fenced = /```(?:vdsl|visamp)?\s*\n([\s\S]*?)```/i.exec(response);
  return (fenced?.[1] ?? response).trim();
}

export async function validateRender(script: string) {
  const validatorUrl = process.env.AI_VALIDATOR_URL;
  if (!validatorUrl) throw new Error("AI generation is not configured (AI_VALIDATOR_URL)");
  const response = await fetch(`${validatorUrl.replace(/\/$/, "")}/validate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ script }),
    signal: AbortSignal.timeout(Number(process.env.AI_VALIDATOR_TIMEOUT_MS ?? 20_000)),
  });
  const result = (await response.json()) as ValidationResponse;
  if (!response.ok) return { ok: false, diagnostic: result.error ?? "Render validation failed" };
  if (result.ok) return { ok: true, diagnostic: "" };
  const failures = Object.entries(result.checks ?? {})
    .filter(([, check]) => check.enabled && !check.passed)
    .map(([name, check]) => `${name} failed${check.value === undefined ? "" : ` (${check.value})`}`);
  return { ok: false, diagnostic: failures.join(", ") || "Render validation failed" };
}
