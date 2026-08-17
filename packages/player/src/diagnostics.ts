import type { CompileResult, Diagnostic } from "./types";

/**
 * `build_ast` flattens pest's structured error into a display string, so the
 * only place line/column survives is the `--> line:col` marker inside that
 * text. Scrape it back out.
 *
 * Locked by `parse_error_carries_line_and_column` in the engine's test suite —
 * if the engine ever returns structured diagnostics, delete this and read them
 * directly.
 */
const LOCATION = /-->\s*(\d+):(\d+)/;
/** pest puts the actual reason on a trailing `= expected ...` line. */
const REASON = /^\s*=\s*(.+)$/m;

/**
 * Pull a one-line summary out of pest's multi-line rendering, which otherwise
 * drags its whole caret diagram into every log row.
 */
function summarise(raw: string): string {
  const reason = REASON.exec(raw);
  if (reason?.[1]) return reason[1].trim();

  // No reason line: fall back to the first non-empty line.
  return raw.split("\n").find((line) => line.trim())?.trim() ?? raw;
}

export function parseDiagnostics(raw: string): Diagnostic[] {
  const text = raw.trim();
  if (!text) return [];

  const match = LOCATION.exec(text);
  const message = summarise(text);

  if (!match) {
    return [{ severity: "error", message, raw: text }];
  }

  return [
    {
      severity: "error",
      message,
      raw: text,
      line: Number(match[1]),
      column: Number(match[2]),
    },
  ];
}

export function toCompileResult(raw: string): CompileResult {
  const diagnostics = parseDiagnostics(raw);
  return {
    ok: diagnostics.length === 0,
    diagnostics,
    // No audio bindings exist in the DSL yet.
    usesAudio: false,
  };
}
