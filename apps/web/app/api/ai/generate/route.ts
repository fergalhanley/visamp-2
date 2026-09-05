import { callModel, extractScript, validateRender } from "@/lib/ai/server";
import { isAiModelKey, type GenerationEvent } from "@/lib/ai/types";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function line(event: GenerationEvent) {
  return `${JSON.stringify(event)}\n`;
}

export async function POST(request: Request) {
  let input: { prompt?: unknown; source?: unknown; visId?: unknown; model?: unknown };
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
    !isAiModelKey(input.model)
  ) {
    return Response.json({ error: "Invalid generation request" }, { status: 400 });
  }
  const prompt = input.prompt;
  const source = input.source;
  const visId = input.visId;
  const model = input.model;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Sign in to use AI generation" }, { status: 401 });
  const { data: visualisation } = await supabase
    .from("visualisations")
    .select("id, owner_id")
    .eq("id", visId)
    .maybeSingle();
  if (!visualisation || visualisation.owner_id !== user.id)
    return Response.json({ error: "You can only generate into your own visualisations" }, { status: 403 });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (event: GenerationEvent) => controller.enqueue(encoder.encode(line(event)));
      const messages: Array<{ role: "user" | "assistant"; content: string }> = [{
        role: "user",
        content: `Current script:\n<current_script>\n${source}\n</current_script>\n\nInstruction:\n${prompt.trim()}`,
      }];
      let closest = "";
      let diagnostic = "";
      try {
        const configuredAttempts = Number(process.env.AI_ATTEMPT_BUDGET ?? 3);
        const attempts = Number.isInteger(configuredAttempts)
          ? Math.min(10, Math.max(1, configuredAttempts))
          : 3;
        for (let attempt = 1; attempt <= attempts; attempt += 1) {
          emit({ type: "status", message: attempt === 1 ? "Generating…" : `Retrying… (attempt ${attempt})` });
          const raw = await callModel(model, messages);
          closest = extractScript(raw);
          emit({ type: "status", message: `Generated attempt ${attempt}. Checking render…` });
          const validation = await validateRender(closest);
          if (validation.ok) {
            emit({ type: "success", source: closest, message: "Render OK. Updated the editor." });
            return;
          }
          diagnostic = validation.diagnostic;
          emit({ type: "status", level: "warn", message: `Validation failed (attempt ${attempt}) — ${diagnostic}` });
          messages.push({ role: "assistant", content: raw });
          messages.push({
            role: "user",
            content: `That script failed validation: ${diagnostic}\nReturn a complete corrected script only.`,
          });
        }
        emit({
          type: "exhausted",
          source: closest,
          diagnostics: diagnostic,
          message: "Validation failed after all attempts. The editor was left unchanged and no credits were charged.",
        });
      } catch (error) {
        emit({ type: "error", message: error instanceof Error ? error.message : "Generation failed" });
      } finally {
        controller.close();
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
