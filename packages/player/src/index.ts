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
  ExternalParamValue,
  LogEntry,
  LogLevel,
  ParamView,
  PropertyView,
  ResolvedAsset,
  VisampCanvasHandle,
} from "./types";
