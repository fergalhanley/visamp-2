import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";

interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
}

interface OpenAiResponse {
  output_text?: string;
  output?: Array<{
    type?: string;
    content?: Array<{ type?: string; text?: string }>;
  }>;
  error?: { message?: string };
}

interface ValidationResponse {
  ok?: boolean;
  error?: string;
  checks?: Record<
    string,
    { enabled: boolean; passed: boolean; value?: number }
  >;
}

let referencePromise: Promise<string> | undefined;

async function visriptReference() {
  referencePromise ??= Promise.all([
    readFile(
      path.resolve(process.cwd(), "../../packages/engine/visript.pest"),
      "utf8",
    ),
    readFile(
      path.resolve(process.cwd(), "../docs/src/programming/oscillators.md"),
      "utf8",
    ),
    readFile(
      path.resolve(process.cwd(), "../docs/src/examples/basic.md"),
      "utf8",
    ),
    readFile(
      path.resolve(process.cwd(), "../docs/src/examples/animation.md"),
      "utf8",
    ),
    readFile(
      path.resolve(process.cwd(), "../docs/src/programming/system-values.md"),
      "utf8",
    ),
    readFile(
      path.resolve(process.cwd(), "../docs/src/effects/filters.md"),
      "utf8",
    ),
    readFile(
      path.resolve(process.cwd(), "../docs/src/programming/audio-detection.md"),
      "utf8",
    ),
    readFile(
      path.resolve(process.cwd(), "../docs/src/programming/input-detection.md"),
      "utf8",
    ),
    readFile(
      path.resolve(process.cwd(), "../docs/src/drawing/creative-tools.md"),
      "utf8",
    ),
  ]).then(
    ([
      grammar,
      oscillators,
      basic,
      animation,
      systemValues,
      filters,
      audioDetection,
      inputDetection,
      creativeTools,
    ]) =>
      [
        "You generate Visript code. Return only the complete Visript script, with no explanation.",
        "Preserve useful behavior from the current script unless the instruction asks to replace it.",
        "The result must include exactly one render block and must visibly respond to audio when requested.",
        "Prefer audio::detect snapshot functions for new audio-reactive code. All arguments are named, including low_hz and high_hz.",
        "Grammar:",
        grammar,
        "Examples and language reference:",
        basic,
        animation,
        oscillators,
        systemValues,
        filters,
        audioDetection,
        "## Input state and events",
        inputDetection,
        creativeTools,
      ].join("\n\n"),
  );
  return referencePromise;
}

function maxOutputTokens() {
  return Number(process.env.AI_MAX_OUTPUT_TOKENS ?? 8192);
}

function timedSignal(signal: AbortSignal | undefined, timeoutMs: number) {
  const timeout = AbortSignal.timeout(timeoutMs);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

export async function callModel(
  messages: ConversationMessage[],
  signal?: AbortSignal,
  model: "gpt-6-astra" = "gpt-6-astra",
) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("ChatGPT generation is not configured (OPENAI_API_KEY)");
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
      instructions: await visriptReference(),
      input: messages,
      max_output_tokens: maxOutputTokens(),
      store: false,
    }),
    signal: timedSignal(
      signal,
      Number(process.env.AI_MODEL_TIMEOUT_MS ?? 60_000),
    ),
  });
  const payload = (await response.json()) as OpenAiResponse;
  if (!response.ok) {
    throw new Error(
      payload.error?.message ?? `OpenAI request failed (${response.status})`,
    );
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

export function extractScript(response: string) {
  const fenced = /```(?:visript|viscript|vdsl|visamp)?\s*\n([\s\S]*?)```/i.exec(
    response,
  );
  return (fenced?.[1] ?? response).trim();
}

export async function validateRender(script: string, signal?: AbortSignal) {
  const validatorUrl = process.env.AI_VALIDATOR_URL;
  if (!validatorUrl)
    throw new Error("AI generation is not configured (AI_VALIDATOR_URL)");
  const response = await fetch(`${validatorUrl.replace(/\/$/, "")}/validate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ script }),
    signal: timedSignal(
      signal,
      Number(process.env.AI_VALIDATOR_TIMEOUT_MS ?? 20_000),
    ),
  });
  const result = (await response.json()) as ValidationResponse;
  if (!response.ok)
    return {
      ok: false,
      diagnostic: result.error ?? "Render validation failed",
    };
  if (result.ok) return { ok: true, diagnostic: "" };
  const failures = Object.entries(result.checks ?? {})
    .filter(([, check]) => check.enabled && !check.passed)
    .map(
      ([name, check]) =>
        `${name} failed${check.value === undefined ? "" : ` (${check.value})`}`,
    );
  return {
    ok: false,
    diagnostic: failures.join(", ") || "Render validation failed",
  };
}
