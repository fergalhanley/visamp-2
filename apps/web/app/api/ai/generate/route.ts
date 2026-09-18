import { callModel, extractScript, validateRender } from "@/lib/ai/server";
import {
  admitAiGeneration,
  aiGenerationEnabled,
  completeAiGeneration,
  chargeAiRepair,
} from "@/lib/ai/guardrails";
import { type GenerationEvent } from "@/lib/ai/types";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 300;

function line(event: GenerationEvent) {
  return `${JSON.stringify(event)}\n`;
}

export async function POST(request: Request) {
  if (!aiGenerationEnabled()) {
    return Response.json(
      { error: "AI generation is not currently enabled" },
      { status: 503 },
    );
  }

  let input: {
    prompt?: unknown;
    source?: unknown;
    visId?: unknown;
    mode?: unknown;
    diagnostics?: unknown;
    expectedCost?: unknown;
  };
  try {
    input = (await request.json()) as typeof input;
  } catch {
    return Response.json({ error: "Expected a JSON body" }, { status: 400 });
  }
  if (
    typeof input.prompt !== "string" ||
    !input.prompt.trim() ||
    input.prompt.length > 4000 ||
    typeof input.source !== "string" ||
    input.source.length > 200_000 ||
    typeof input.visId !== "string" ||
    (input.mode !== undefined &&
      input.mode !== "generate" &&
      input.mode !== "repair") ||
    (input.mode === "repair" &&
      (!input.source.trim() ||
        typeof input.diagnostics !== "string" ||
        input.diagnostics.length > 16000 ||
        typeof input.expectedCost !== "number" ||
        !Number.isSafeInteger(input.expectedCost) ||
        input.expectedCost < 0))
  ) {
    return Response.json(
      { error: "Invalid generation request" },
      { status: 400 },
    );
  }
  const repair = input.mode === "repair";
  const prompt = input.prompt;
  const source = input.source;
  const visId = input.visId;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return Response.json(
      { error: "Sign in to use AI generation" },
      { status: 401 },
    );
  const { data: visualisation } = await supabase
    .from("visualisations")
    .select("id, owner_id")
    .eq("id", visId)
    .maybeSingle();
  if (!visualisation || visualisation.owner_id !== user.id)
    return Response.json(
      { error: "You can only generate into your own visualisations" },
      { status: 403 },
    );

  let admission;
  try {
    admission = await admitAiGeneration(request, user.id);
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "AI request controls are unavailable",
      },
      { status: 503 },
    );
  }
  if (!admission.allowed) {
    const message =
      admission.reason === "concurrency"
        ? "Too many AI generations are already running"
        : admission.reason === "insufficient_credit"
          ? "You do not have enough AI credits for this generation"
          : "AI generation rate limit reached";
    return Response.json(
      { error: message },
      {
        status: admission.reason === "insufficient_credit" ? 402 : 429,
        headers: { "Retry-After": String(admission.retryAfterSeconds) },
      },
    );
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (event: GenerationEvent) => {
        if (!request.signal.aborted) {
          controller.enqueue(encoder.encode(line(event)));
        }
      };
      const messages: Array<{ role: "user" | "assistant"; content: string }> = [
        {
          role: "user",
          content: `Current script:\n<current_script>\n${source}\n</current_script>\n\nInstruction:\n${prompt.trim()}`,
        },
      ];
      if (repair)
        messages.push({
          role: "user",
          content: `Repair this code attempt. Its previous error was:\n${input.diagnostics}\nThe user may have edited the code since that error. Return the complete corrected script only.`,
        });
      let closest = repair ? source : "";
      let diagnostic = "";
      let completedAs: "success" | "exhausted" | "error" | "aborted" = "error";
      let attemptsUsed = 0;
      let settled = false;
      let repairCharged = false;
      try {
        if (request.signal.aborted)
          throw new DOMException("The request was cancelled", "AbortError");
        if (repair) {
          await chargeAiRepair(
            admission.requestId,
            input.expectedCost as number,
          );
          repairCharged = true;
        }
        const attempts = repair ? 1 : 2;
        for (let attempt = 1; attempt <= attempts; attempt += 1) {
          if (request.signal.aborted) {
            throw new DOMException("The request was cancelled", "AbortError");
          }
          attemptsUsed = attempt;
          emit({
            type: "status",
            message: repair
              ? "Trying to fix with GPT-6 Astra…"
              : attempt === 1
                ? "Generating with GPT-6 Astra…"
                : "Retrying with GPT-6 Astra… (attempt 2 of 2)",
          });
          let raw: string;
          const model = "gpt-6-astra";
          try {
            raw = await callModel(messages, request.signal, model);
          } catch (error) {
            if (request.signal.aborted || attempt === attempts) throw error;
            emit({
              type: "status",
              level: "warn",
              message: "The first model attempt failed. Retrying once with GPT-6 Astra…",
            });
            continue;
          }
          closest = extractScript(raw);
          emit({ type: "attempt", source: closest });
          emit({
            type: "status",
            message: `Generated attempt ${attempt}. Checking render…`,
          });
          const validation = await validateRender(closest, request.signal);
          if (validation.ok) {
            if (request.signal.aborted)
              throw new DOMException("The request was cancelled", "AbortError");
            await completeAiGeneration(
              admission.requestId,
              "success",
              attemptsUsed,
              closest,
            );
            settled = true;
            completedAs = "success";
            emit({
              type: "success",
              source: closest,
              message: "Render OK. Updated the editor.",
            });
            return;
          }
          diagnostic = validation.diagnostic;
          emit({
            type: "status",
            level: "warn",
            message: `Validation failed (attempt ${attempt}) — ${diagnostic}`,
          });
          messages.push({ role: "assistant", content: raw });
          messages.push({
            role: "user",
            content: `That script failed validation: ${diagnostic}\nReturn a complete corrected script only.`,
          });
        }
        completedAs = "exhausted";
        await completeAiGeneration(
          admission.requestId,
          completedAs,
          attemptsUsed,
          repair ? closest : undefined,
        );
        settled = true;
        emit({
          type: "exhausted",
          source: closest,
          diagnostics: diagnostic,
          message: repair
            ? "The repair failed validation. The repair attempt was charged; the editor was left unchanged."
            : "Validation failed after both attempts. The editor was left unchanged and no credits were charged.",
        });
      } catch (error) {
        completedAs = request.signal.aborted ? "aborted" : "error";
        console.error("AI generation failed", {
          requestId: admission.requestId,
          repair,
          message: error instanceof Error ? error.message : "Generation failed",
        });
        if (!request.signal.aborted) {
          emit({
            type: "error",
            diagnostics: diagnostic || undefined,
            source: closest || undefined,
            message:
              (error instanceof Error ? error.message : "Generation failed") +
              (repairCharged ? " The repair attempt was charged." : ""),
          });
        }
      } finally {
        if (!settled)
          await completeAiGeneration(
            admission.requestId,
            completedAs,
            attemptsUsed,
            repairCharged ? closest : undefined,
          ).catch(() => {
            // Failed/cancelled requests retain a reservation until expiry if
            // bookkeeping is unavailable. A success is never emitted before settlement.
          });
        try {
          controller.close();
        } catch {
          // The client may already have cancelled the stream.
        }
      }
    },
  });
  return new Response(stream, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
