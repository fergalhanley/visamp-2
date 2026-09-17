"use client";

import { Loader2, Send } from "lucide-react";
import Link from "next/link";
import type { CreditSummary } from "@/lib/billing/server";
import { useEffect, useState, type KeyboardEvent } from "react";

import { cn } from "@/lib/utils";

interface AiPromptProps {
  disabled: boolean;
  generating: boolean;
  onSubmit: (prompt: string) => Promise<void>;
}

export function AiPrompt({ disabled, generating, onSubmit }: AiPromptProps) {
  const [prompt, setPrompt] = useState("");

  const [credits, setCredits] = useState<CreditSummary | null>(null);
  const [creditError, setCreditError] = useState(false);
  useEffect(() => {
    if (disabled) return;
    const controller = new AbortController();
    const refresh = () => {
      void fetch("/api/billing", {
        cache: "no-store",
        signal: controller.signal,
      })
        .then(async (r) => {
          if (!r.ok) throw new Error();
          return r.json();
        })
        .then((data) => {
          setCredits(data);
          setCreditError(false);
        })
        .catch(() => {
          if (!controller.signal.aborted) setCreditError(true);
        });
    };
    refresh();
    window.addEventListener("focus", refresh);
    return () => {
      controller.abort();
      window.removeEventListener("focus", refresh);
    };
  }, [disabled, generating]);
  const insufficient =
    !credits ||
    creditError ||
    (!credits.exempt && credits.available < credits.generationCost);
  const submit = async () => {
    const value = prompt.trim();
    if (!value || disabled || generating || insufficient) return;
    await onSubmit(value);
    setPrompt("");
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (
      event.key !== "Enter" ||
      event.shiftKey ||
      event.nativeEvent.isComposing
    )
      return;
    event.preventDefault();
    void submit();
  };

  return (
    <div className="shrink-0 border-b bg-foreground/[0.025] p-2">
      <div>
        <textarea
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          onKeyDown={onKeyDown}
          disabled={disabled || generating}
          rows={3}
          aria-label="Describe a change to this visualisation"
          placeholder={
            disabled
              ? "AI editing is available on your own visualisations"
              : "Describe what to create or change… (Enter to send, Shift+Enter for a new line)"
          }
          className={cn(
            "block max-h-36 min-h-20 w-full resize-y rounded-md border bg-black/20",
            "px-3 py-2 text-sm leading-5 outline-none placeholder:text-muted-foreground",
            "focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring",
            "disabled:cursor-not-allowed disabled:opacity-50",
          )}
        />
        <div className="mt-2 flex items-center justify-end gap-2">
          <span className="mr-auto text-xs text-muted-foreground">
            {creditError
              ? "Credits unavailable"
              : credits?.exempt
                ? "Credit-exempt account"
                : credits
                  ? `${credits.available.toLocaleString()} credits · ${credits.generationCost} per successful request`
                  : disabled
                    ? ""
                    : "Loading credits…"}
            {!disabled && (
              <Link
                href="/account/billing"
                target="_blank"
                rel="noopener noreferrer"
                className="ml-2 underline"
              >
                Buy credits
              </Link>
            )}
          </span>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={disabled || generating || insufficient || !prompt.trim()}
            aria-label="Generate code"
            title="Generate code"
            className={cn(
              "flex h-8 items-center justify-center gap-1.5 rounded-md px-3 text-xs font-medium",
              "bg-emerald-500 text-black transition hover:bg-emerald-400",
              "disabled:cursor-not-allowed disabled:opacity-40",
            )}
          >
            {generating ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Send className="h-3.5 w-3.5" />
            )}
            Generate
          </button>
        </div>
      </div>
    </div>
  );
}
