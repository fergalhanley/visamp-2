/**
 * The engine contract from dev/stories.md §3, as far as the current WASM
 * module can honour it. Fields the module cannot supply yet are marked.
 */

export type DiagnosticSeverity = "error" | "warning";

export interface Diagnostic {
  severity: DiagnosticSeverity;
  /** Single-line summary, suitable for a log row or a gutter tooltip. */
  message: string;
  /** The engine's full text, including pest's caret diagram. */
  raw: string;
  /** 1-based. Recovered from pest's error text; see `parseDiagnostics`. */
  line?: number;
  /** 1-based. */
  column?: number;
}

export interface CompileResult {
  ok: boolean;
  diagnostics: Diagnostic[];
  /**
   * Always false today. The DSL has no audio bindings, so there is nothing to
   * detect — see the E1 gap noted in dev/stories.md §3.
   */
  usesAudio: boolean;
}

export type LogLevel = "info" | "warn" | "error";

export interface LogEntry {
  level: LogLevel;
  message: string;
  line?: number;
}

/** The shape wasm-pack generates for the current crate. */
export interface EngineModule {
  main_web(): void;
  load_script(code: string): string;
  get_last_error(): string;
  capture_frame(): Promise<Blob>;
}

export interface VisampCanvasHandle {
  /**
   * Resolves a PNG Blob at a fixed 1280×720, whatever size the canvas is on
   * screen — so thumbnails don't inherit the author's window (§3).
   */
  captureFrame: () => Promise<Blob>;
}
