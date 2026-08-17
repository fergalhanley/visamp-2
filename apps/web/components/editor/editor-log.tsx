"use client";

import { ChevronDown, ChevronUp, Trash2 } from "lucide-react";

import { cn } from "@/lib/utils";

export interface LogLine {
  id: number;
  level: "info" | "warn" | "error";
  message: string;
  line?: number;
  at: number;
}

const LEVEL_COLOUR: Record<LogLine["level"], string> = {
  info: "text-muted-foreground",
  warn: "text-amber-400",
  error: "text-destructive",
};

interface EditorLogProps {
  lines: LogLine[];
  collapsed: boolean;
  onToggle: () => void;
  onClear: () => void;
  onJumpToLine: (line: number) => void;
}

/** E6.6 — the code log. Collapsible, and clicking a line reference moves the cursor. */
export function EditorLog({
  lines,
  collapsed,
  onToggle,
  onClear,
  onJumpToLine,
}: EditorLogProps) {
  const errorCount = lines.filter((l) => l.level === "error").length;

  return (
    <section className="flex min-h-0 flex-1 flex-col border-t">
      <header className="flex shrink-0 items-center justify-between px-3 py-1.5">
        <button
          type="button"
          onClick={onToggle}
          className="flex items-center gap-1.5 text-xs text-muted-foreground transition hover:text-foreground"
        >
          {collapsed ? (
            <ChevronUp className="h-3.5 w-3.5" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5" />
          )}
          Log
          {errorCount > 0 && (
            <span className="rounded-full bg-destructive/20 px-1.5 text-[10px] text-destructive">
              {errorCount}
            </span>
          )}
        </button>

        {lines.length > 0 && (
          <button
            type="button"
            onClick={onClear}
            aria-label="Clear log"
            className="text-muted-foreground transition hover:text-foreground"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </header>

      {!collapsed && (
        <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3 font-mono text-[11px] leading-relaxed">
          {lines.length === 0 ? (
            <p className="text-muted-foreground">No output yet.</p>
          ) : (
            <ul className="space-y-0.5">
              {lines.map((entry) => (
                <li key={entry.id} className={cn("flex gap-2", LEVEL_COLOUR[entry.level])}>
                  {entry.line !== undefined ? (
                    <button
                      type="button"
                      onClick={() => onJumpToLine(entry.line!)}
                      className="shrink-0 underline decoration-dotted underline-offset-2"
                    >
                      L{entry.line}
                    </button>
                  ) : (
                    <span className="shrink-0 opacity-50">–</span>
                  )}
                  <span className="whitespace-pre-wrap break-words">{entry.message}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
