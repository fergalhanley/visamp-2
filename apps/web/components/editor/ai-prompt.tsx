"use client";

import { Loader2, Send } from "lucide-react";
import { useState, type KeyboardEvent } from "react";

import { cn } from "@/lib/utils";

interface AiPromptProps {
  disabled: boolean;
  generating: boolean;
  onSubmit: (prompt: string) => Promise<void>;
}

export function AiPrompt({ disabled, generating, onSubmit }: AiPromptProps) {
  const [prompt, setPrompt] = useState("");

  const submit = async () => {
    const value = prompt.trim();
    if (!value || disabled || generating) return;
    await onSubmit(value);
    setPrompt("");
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    void submit();
  };

  return (
    <div className="shrink-0 border-b bg-foreground/[0.025] p-2">
      <div className="relative">
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
            "px-3 py-2 pr-10 text-sm leading-5 outline-none placeholder:text-muted-foreground",
            "focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring",
            "disabled:cursor-not-allowed disabled:opacity-50",
          )}
        />
        <button
          type="button"
          onClick={() => void submit()}
          disabled={disabled || generating || !prompt.trim()}
          aria-label="Generate code"
          title="Generate code"
          className={cn(
            "absolute bottom-2 right-2 flex h-7 w-7 items-center justify-center rounded-md",
            "bg-emerald-500 text-black transition hover:bg-emerald-400",
            "disabled:cursor-not-allowed disabled:opacity-40",
          )}
        >
          {generating ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Send className="h-3.5 w-3.5" />
          )}
        </button>
      </div>
    </div>
  );
}
