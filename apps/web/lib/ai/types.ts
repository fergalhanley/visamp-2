export type GenerationEvent =
  | { type: "status"; message: string; level?: "info" | "warn" | "error" }
  | { type: "attempt"; source: string }
  | { type: "success"; source: string; message: string }
  | { type: "exhausted"; source: string; diagnostics: string; message: string }
  | { type: "error"; message: string; source?: string };
