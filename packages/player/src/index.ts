export { engineVersion } from "./version";
export { VisampCanvas } from "./visamp-canvas";
export type { VisampCanvasProps } from "./visamp-canvas";
export { parseDiagnostics, toCompileResult } from "./diagnostics";
export { startAudioBridge } from "./audio-bridge";
export { startParamsBridge, startPropertiesBridge } from "./properties-bridge";
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
export { HdrSceneRenderer } from "./webgpu-hdr-renderer";
export { tessellateHdr2D } from "./hdr-2d-geometry";
export type { Hdr2DFrame } from "./hdr-2d-geometry";

export {
  MAX_LFOS,
  MAX_MODULATION_ROUTES,
  configureModulation,
  defaultModulationConfig,
  evaluateLfo,
  resolveModulatedProperties,
  validateModulation,
} from "./lfo-modulation";
export type {
  LfoConfig,
  LfoPolarity,
  LfoWaveform,
  ModulationConfig,
  ModulationRoute,
} from "./lfo-modulation";
