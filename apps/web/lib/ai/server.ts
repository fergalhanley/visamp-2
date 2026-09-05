import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";

import type { AiModelKey } from "@/lib/ai/types";

interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
}

interface AnthropicResponse {
  content?: Array<{ type: string; text?: string }>;
  error?: { message?: string };
}

interface OpenAiResponse {
  output_text?: string;
  output?: Array<{
    type?: string;
    content?: Array<{ type?: string; text?: string }>;
  }>;
  error?: { message?: string };
}

interface QwenResponse {
  choices?: Array<{ message?: { content?: string } }>;
  error?: { message?: string };
  message?: string;
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

function maxOutputTokens() {
  return Number(process.env.AI_MAX_OUTPUT_TOKENS ?? 8192);
}

function modelTimeout() {
  return AbortSignal.timeout(Number(process.env.AI_MODEL_TIMEOUT_MS ?? 60_000));
}

async function callAnthropic(messages: ConversationMessage[]) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const model = process.env.AI_ANTHROPIC_MODEL ?? process.env.AI_STANDARD_MODEL;
  if (!apiKey || !model) {
    throw new Error(
      "Claude generation is not configured (ANTHROPIC_API_KEY and AI_ANTHROPIC_MODEL)",
    );
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
      max_tokens: maxOutputTokens(),
      system: await dslReference(),
      messages,
    }),
    signal: modelTimeout(),
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

async function callOpenAi(messages: ConversationMessage[]) {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.AI_OPENAI_MODEL;
  if (!apiKey || !model) {
    throw new Error(
      "ChatGPT generation is not configured (OPENAI_API_KEY and AI_OPENAI_MODEL)",
    );
  }

  const baseUrl = process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1";
  const headers: Record<string, string> = {
    "content-type": "application/json",
    authorization: `Bearer ${apiKey}`,
  };
  const organization = process.env.OPENAI_ORGANIZATION?.trim();
  const project = process.env.OPENAI_PROJECT?.trim();
  if (organization) headers["OpenAI-Organization"] = organization;
  if (project) headers["OpenAI-Project"] = project;

  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/responses`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model,
      instructions: await dslReference(),
      input: messages,
      max_output_tokens: maxOutputTokens(),
      store: false,
    }),
    signal: modelTimeout(),
  });
  const payload = (await response.json()) as OpenAiResponse;
  if (!response.ok) {
    throw new Error(payload.error?.message ?? `OpenAI request failed (${response.status})`);
  }
  const text =
    payload.output_text?.trim() ||
    payload.output
      ?.flatMap((item) => item.content ?? [])
      .filter((item) => item.type === "output_text")
      .map((item) => item.text ?? "")
      .join("\n")
      .trim();
  if (!text) throw new Error("ChatGPT returned no code");
  return text;
}

async function callQwen(messages: ConversationMessage[]) {
  const apiKey = process.env.DASHSCOPE_API_KEY ?? process.env.ALIBABA_API_KEY;
  const model = process.env.AI_QWEN_MODEL;
  const baseUrl = process.env.ALIBABA_BASE_URL ?? process.env.DASHSCOPE_BASE_URL;
  if (!apiKey || !model || !baseUrl) {
    throw new Error(
      "Qwen generation is not configured (DASHSCOPE_API_KEY, AI_QWEN_MODEL, and ALIBABA_BASE_URL)",
    );
  }

  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "system", content: await dslReference() }, ...messages],
      max_tokens: maxOutputTokens(),
      enable_thinking: false,
      stream: false,
    }),
    signal: modelTimeout(),
  });
  const payload = (await response.json()) as QwenResponse;
  if (!response.ok) {
    throw new Error(
      payload.error?.message ?? payload.message ?? `Qwen request failed (${response.status})`,
    );
  }
  const text = payload.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error("Qwen returned no code");
  return text;
}

export function callModel(model: AiModelKey, messages: ConversationMessage[]) {
  switch (model) {
    case "anthropic":
      return callAnthropic(messages);
    case "openai":
      return callOpenAi(messages);
    case "qwen":
      return callQwen(messages);
  }
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
