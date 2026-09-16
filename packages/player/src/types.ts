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
  /** 1-based. Recovered from the engine's location marker; see `parseDiagnostics`. */
  line?: number;
  /** 1-based. */
  column?: number;
}

export interface CompileResult {
  ok: boolean;
  diagnostics: Diagnostic[];
  /**
   * Still reported as false. The Visript now *has* audio bindings
   * (waveform, spectrum and beat events), so this is finally
   * computable — it needs the engine to report whether the parsed script
   * references any of them.
   */
  usesAudio: boolean;
}

export type LogLevel = "info" | "warn" | "error";

/** One row of the properties inspector: a `prop` and its value right now. */
export interface PropertyView {
  name: string;
  /** `integer` | `float` | `boolean` | `string` | `array` | `color` | … */
  type: string;
  /**
   * Already formatted by the engine. It is a string rather than a number
   * because a float property can hold NaN or infinity, neither of which
   * survives a JSON round trip.
   */
  value: string;
  /** `#rrggbb`, present only for colour properties, for a swatch. */
  swatch?: string;
}

export interface LogEntry {
  level: LogLevel;
  message: string;
  line?: number;
  column?: number;
}

/** The shape wasm-pack generates for the current crate. */
export interface EngineModule {
  main_web(): void;
  queue_input(json: string): void;
  clear_input(): void;
  input_capabilities(code: string): number;
  load_script(code: string): string;
  validate_script(code: string): string;
  get_last_error(): string;
  /** PNG snapshot with engine post-processing baked into the pixels. */
  capture_frame(): Promise<Blob>;
  set_audio_analysis(waveform: Float32Array, spectrum: Float32Array, sampleRate: number, level: number, beat: boolean, onset: boolean, onsetStrength: number): void;
  set_audio_frequency(frequency: Uint8Array): void;
  clear_audio_frame(): void;
  /** JSON array of `PropertyView`; see `startPropertiesBridge`. */
  get_properties(): string;
  set_asset_texture(id: string, width: number, height: number, rgba: Uint8Array): boolean;
  set_asset_mesh(
    id: string,
    vertices: Float32Array,
    indices: Uint32Array,
    normals: Float32Array,
    uvs: Float32Array,
  ): boolean;
  set_asset_points(id: string, vertices: Float32Array): boolean;
  clear_assets(): void;
}

/**
 * An asset the host has already fetched and decoded.
 *
 * Decoding happens outside the player because fetching does: whether the
 * current viewer may read an asset is decided by the storage policies, and the
 * player has no session to decide it with. By the time one of these arrives,
 * that question has been answered.
 */
export type ResolvedAsset =
  | {
      id: string;
      kind: "texture";
      width: number;
      height: number;
      /** `width * height * 4` bytes, RGBA. */
      rgba: Uint8Array;
    }
  | {
      id: string;
      kind: "mesh";
      /** Ordered point positions decoded from this model, including POINTS primitives. */
      points?: Float32Array;
      vertices: Float32Array;
      indices: Uint32Array;
      normals: Float32Array;
      uvs: Float32Array;
    };

export interface VisampCanvasHandle {
  /**
   * Resolves a PNG Blob at a fixed 1280×720, whatever size the canvas is on
   * screen — so thumbnails don't inherit the author's window (§3).
   */
  captureFrame: () => Promise<Blob>;
}
