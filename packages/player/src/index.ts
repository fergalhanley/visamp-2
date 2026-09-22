export { engineVersion } from "./version";
export { VisampCanvas } from "./visamp-canvas";
export type { VisampCanvasProps } from "./visamp-canvas";
export { parseDiagnostics, toCompileResult } from "./diagnostics";
export { startAudioBridge } from "./audio-bridge";
export { startPropertiesBridge } from "./properties-bridge";
export type {
  CompileResult,
  Diagnostic,
  DiagnosticSeverity,
  EngineModule,
  LogEntry,
  LogLevel,
  PropertyView,
  ResolvedAsset,
  VisampCanvasHandle,
} from "./types";
