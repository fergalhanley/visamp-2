"use client";

import { Loader2, Send } from "lucide-react";
import { useState, type KeyboardEvent } from "react";

import { cn } from "@/lib/utils";
import { AI_MODEL_OPTIONS, type AiModelKey } from "@/lib/ai/types";

interface AiPromptProps {
  disabled: boolean;
  generating: boolean;
  onSubmit: (prompt: string, model: AiModelKey) => Promise<void>;
}

export function AiPrompt({ disabled, generating, onSubmit }: AiPromptProps) {
  const [prompt, setPrompt] = useState("");
  const [model, setModel] = useState<AiModelKey>("anthropic");

  const submit = async () => {
    const value = prompt.trim();
    if (!value || disabled || generating) return;
    await onSubmit(value, model);
    setPrompt("");
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
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
          <label htmlFor="ai-model" className="sr-only">
            AI model
          </label>
          <select
            id="ai-model"
            value={model}
            onChange={(event) => setModel(event.target.value as AiModelKey)}
            disabled={disabled || generating}
            className={cn(
              "h-8 rounded-md border bg-background px-2 text-xs outline-none",
              "focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring",
              "disabled:cursor-not-allowed disabled:opacity-50",
            )}
          >
            {AI_MODEL_OPTIONS.map((option) => (
              <option key={option.key} value={option.key}>
                {option.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={disabled || generating || !prompt.trim()}
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
