"use client";

import { activateScript } from "./activation";
import { configureModulation, type ModulationConfig } from "./lfo-modulation";
import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type Ref,
} from "react";

import { startInputBridge } from "./input-bridge";
import { startAudioBridge } from "./audio-bridge";
import { startParamsBridge, startPropertiesBridge } from "./properties-bridge";
import { toRuntimeLog, toCompileResult } from "./diagnostics";
import type {
  CompileResult,
  EngineModule,
  LogEntry,
  ParamView,
  PropertyView,
  ResolvedAsset,
  VisampCanvasHandle,
} from "./types";

/**
 * The crate looks this element up by id (`lib.rs`: `HOST_ID`), so it is not
 * configurable until the engine takes an element handle instead.
 */
/**
 * The element the engine draws inside.
 *
 * The engine creates the canvas itself rather than using one React rendered.
 * A canvas keeps whichever context it was first given for its whole life, so
 * switching a script between `context 2d` and `context 3d` means replacing the
 * element — and swapping out a node React owns would break React's own
 * cleanup on unmount.
 */
const HOST_ID = "visamp-stage";

/** How often to drain the engine's last-error slot, in ms. */
const ERROR_POLL_MS = 500;

let mountedOnce = false;

export interface VisampCanvasProps {
  /** Visript source to run. */
  source: string;
  /** Optional visualisation-owned LFO bank. Replace the object to update it;
   * null/removal clears it. Timing follows setAnimationTime and active. */
  modulation?: ModulationConfig | null;
  /**
   * Assets the host has fetched and decoded for the current viewer, keyed by
   * the ids the source cites with `asset::`.
   *
   * Supply assetPreparation to hold activation until every required asset
   * is ready. Callers without preparation retain direct-render behaviour.
   */
  assets?: ResolvedAsset[];
  assetPreparation?: {
    status: "loading" | "error" | "ready";
    missing: readonly string[];
    retry: () => void;
    /** Changes when the viewer changes; previous assets must then be cleared. */
    scope: string;
  };
  posterUrl?: string;
  /**
   * The engine boots the first time this is true, and the WASM module is not
   * fetched before then. This is what makes the landing and cold-link play
   * gates real rather than cosmetic: nothing renders and no audio context is
   * touched until the viewer's click flips it.
   *
   * Setting it back to false freezes the shared animation timeline. The
   * engine keeps its render loop alive so it can resume without reloading.
   */
  active: boolean;
  /** Enable script input. Landing/decorative previews leave this disabled. */
  interactive?: boolean;
  /** Clean capture surfaces report failures to their operator instead. */
  hideErrors?: boolean;
  /** Experimental side-by-side WebGPU HDR preview. Off by default. */
  hdrPreview?: boolean;
  /** Use the live 2D Rust snapshot instead of the 3D snapshot in diagnostic preview. */
  hdr2dPreview?: boolean;
  /** Automatically select HDR 2D playback (default on); SDR remains fallback. */
  autoHdr2D?: boolean;
  /** Diagnostic callback for experimental HDR 2D frame contents. */
  onHdr2DDiagnostic?: (message: string) => void;
  /** Diagnostic HDR multiplier for the WebGPU preview, defaults to 1. */
  hdrIntensity?: number;
  /** Diagnostic Chrome 155 compositing overlay, disabled by default. */
  hdrCompositingWorkaround?: boolean;
  /**
   * Audio graph tap for the `audio::detect` standard library.
   *
   * Supplied by the host because a Web Audio graph cannot span AudioContexts —
   * an analyser created in here could never hear the app's own audio. Null (or
   * absent) leaves scripts seeing silence, which they must already handle.
   */
  analyser?: AnalyserNode | null;
  onCompileResult?: (result: CompileResult) => void;
  /**
   * Fires when the script's `prop` values change. Supplying it starts a poll
   * of the engine, so leave it off where nothing is watching — the player has
   * no inspector and should not pay for one.
   */
  onProperties?: (properties: PropertyView[]) => void;
  onParams?: (params: ParamView[]) => void;
  onLog?: (entry: LogEntry) => void;
  onReady?: () => void;
  className?: string;
  /** Exposes `captureFrame()`. */
  ref?: Ref<VisampCanvasHandle>;
}

/**
 * React wrapper over the current WASM module.
 *
 * The module is a process-wide singleton: `main_web()` is a
 * `#[wasm_bindgen(start)]` function that runs on import, finds the stage, and
 * parks its state in a `thread_local!`. That means **exactly one of these may
 * exist per page load**, which is why it belongs in the root layout and not in
 * a route segment.
 */
export function VisampCanvas({
  source,
  modulation = null,
  assets,
  assetPreparation,
  posterUrl,
  active,
  interactive = false,
  hideErrors = false,
  hdrPreview = false,
  hdr2dPreview = false,
  autoHdr2D = !hdrPreview && !hdr2dPreview,
  onHdr2DDiagnostic,
  hdrIntensity = 1,
  hdrCompositingWorkaround = false,
  analyser,
  onCompileResult,
  onProperties,
  onParams,
  onLog,
  onReady,
  className,
  ref,
}: VisampCanvasProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const hdrCanvasRef = useRef<HTMLCanvasElement>(null);
  const hdrDiagnosticRef = useRef(onHdr2DDiagnostic);
  hdrDiagnosticRef.current = onHdr2DDiagnostic;
  const hdrIntensityRef = useRef(hdrIntensity);
  hdrIntensityRef.current = hdrIntensity;
  const [hdrPreviewError, setHdrPreviewError] = useState("");
  const [hdrPresenting, setHdrPresenting] = useState(false);
  const [autoHdrStatus, setAutoHdrStatus] = useState("");
  const [hdrEligible, setHdrEligible] = useState(false);
  const [activationRevision, setActivationRevision] = useState(0);
  const engineRef = useRef<EngineModule | null>(null);
  const bootedRef = useRef(false);
  const [ready, setReady] = useState(false);
  const [activated, setActivated] = useState(false);
  const [activationError, setActivationError] = useState("");
  const applied = useRef<{
    source: string;
    assets: ResolvedAsset[];
    scope: string;
  } | null>(null);
  const assetStatus = assetPreparation?.status ?? "ready";
  const assetScope = assetPreparation?.scope ?? "default";
  /** Last error already reported via onCompileResult, to avoid double-logging. */
  const reportedErrorRef = useRef("");

  // Callbacks are read through refs so that an inline arrow prop from a parent
  // never re-triggers boot or re-arms the poller.
  const onCompileResultRef = useRef(onCompileResult);
  const onPropertiesRef = useRef(onProperties);
  const onParamsRef = useRef(onParams);
  const onLogRef = useRef(onLog);
  const onReadyRef = useRef(onReady);

  onCompileResultRef.current = onCompileResult;
  onPropertiesRef.current = onProperties;
  onParamsRef.current = onParams;
  onLogRef.current = onLog;
  onReadyRef.current = onReady;

  const modulationRef = useRef(modulation);
  modulationRef.current = modulation;
  const appliedModulation = useRef<ModulationConfig | null>(null);
  const syncModulation = useCallback((reloaded = false) => {
    const engine = engineRef.current;
    if (!engine) return;
    // Successful load_script creates a fresh model and clears its bank.
    if (reloaded) appliedModulation.current = null;
    const config = modulationRef.current;
    if (config === appliedModulation.current) return;
    try {
      configureModulation(engine, config);
      appliedModulation.current = config;
    } catch (error) {
      // A rejected declarative replacement must not keep the previous scene's
      // automation running. The lower-level WASM setter itself is atomic.
      if (appliedModulation.current) configureModulation(engine, null);
      appliedModulation.current = null;
      onLogRef.current?.({ level: "error", message: `Modulation: ${error instanceof Error ? error.message : String(error)}` });
    }
  }, []);

  useEffect(() => () => {
    if (engineRef.current && appliedModulation.current) configureModulation(engineRef.current, null);
    appliedModulation.current = null;
  }, []);

  useEffect(() => {
    if (process.env.NODE_ENV !== "production") {
      if (mountedOnce && !bootedRef.current) {
        console.warn(
          "[visamp] A second <VisampCanvas> mounted. The WASM module is a " +
            "singleton bound to the stage; the newer instance will not render.",
        );
      }
      mountedOnce = true;
    }
  }, []);

  // Boot. Deliberately depends only on `active` — the module import is the
  // expensive, irreversible step.
  //
  // There is deliberately no cancellation here. The module is a process-wide
  // singleton, so there is nothing meaningful to cancel, and a cleanup flag
  // would make StrictMode's mount→cleanup→mount skip the first (and only)
  // import: `bootedRef` blocks the second run, leaving the canvas blank
  // forever.
  useEffect(() => {
    if (!active || bootedRef.current) return;
    bootedRef.current = true;

    // The canvas element must already be in the document, because the import
    // itself runs `main_web()`. Effects run post-commit, so it is.
    void import("@visamp/engine").then((module) => {
      engineRef.current = module as unknown as EngineModule;
      setReady(true);
      onReadyRef.current?.();
    }).catch((error: unknown) => {
      onLogRef.current?.({
        level: "error",
        message: `Could not start the rendering engine: ${error instanceof Error ? error.message : String(error)}. Reload the page to retry.`,
      });
    });
  }, [active]);

  useEffect(() => {
    engineRef.current?.set_animation_paused(!active);
    return () => engineRef.current?.set_animation_paused(true);
  }, [active, ready]);

  // Validate independently of readiness so editor diagnostics/autosave still
  // work while downloads are pending. Activation waits for the complete set.
  useEffect(() => {
    const engine = engineRef.current;
    if (!ready || !engine) return;
    if (applied.current && applied.current.scope !== assetScope) {
      engine.clear_assets();
      engine.load_script("");
      applied.current = null;
      setActivated(false);
    }
    let result: CompileResult;
    try {
      const error = engine.validate_script(source);
      result = toCompileResult(error);
      if (result.ok && assetStatus === "ready") {
        const prepared = assets ?? EMPTY_ASSETS;
        const previous = applied.current;
        if (
          !previous ||
          previous.source !== source ||
          previous.assets !== prepared
        ) {
          const error = activateScript(
            engine,
            source,
            prepared,
            previous?.assets ?? EMPTY_ASSETS,
          );
          result = toCompileResult(error);
          if (result.ok) {
            // Install before yielding to the next engine animation frame.
            syncModulation(true);
            applied.current = { source, assets: prepared, scope: assetScope };
            setActivated(true);
            setActivationRevision((revision) => revision + 1);
            setActivationError("");
          }
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setActivationError(message);
      onLogRef.current?.({ level: "error", message });
      result = {
        ok: false,
        usesAudio: false,
        diagnostics: [{ severity: "error", message, raw: message }],
      };
    }
    reportedErrorRef.current = result.ok
      ? ""
      : (result.diagnostics[0]?.raw ?? "");
    onCompileResultRef.current?.(result);
  }, [ready, source, assets, assetStatus, assetScope, syncModulation]);

  // Run after activation: a source+config replacement must validate its routes
  // against the newly loaded properties, never the previous visualisation.
  useEffect(() => {
    if (ready && activated && applied.current?.source === source) syncModulation();
  }, [ready, activated, source, modulation, syncModulation]);

  useEffect(() => {
    const engine = engineRef.current;
    const host = stageRef.current;
    if (
      !engine ||
      !host ||
      !ready ||
      !active ||
      !interactive ||
      assetStatus !== "ready" ||
      applied.current?.source !== source
    )
      return;
    return startInputBridge(
      host,
      engine,
      engine.input_capabilities(source),
      (message) => {
        onLogRef.current?.({ level: "error", message });
      },
    );
  }, [ready, active, interactive, source, assetStatus, activationRevision]);

  // The engine reports runtime errors by parking a string rather than calling
  // out, so drain it on an interval. Replace with a real callback when the
  // engine grows one.
  useEffect(() => {
    if (!active) return;

    let last = "";
    const id = window.setInterval(() => {
      const engine = engineRef.current;
      if (!engine) return;

      const error = engine.get_last_error();
      if (error === last) return;
      last = error;

      // Already surfaced through onCompileResult.
      if (error && error !== reportedErrorRef.current) {
        onLogRef.current?.(toRuntimeLog(error));
      }
    }, ERROR_POLL_MS);

    return () => window.clearInterval(id);
  }, [active]);

  // Follow the host analyser lifetime; normalized detection runs independently
  // of rendered frames.
  useEffect(() => {
    const engine = engineRef.current;
    if (!ready || !engine || !analyser) return;

    return startAudioBridge(engine, analyser, (message) => {
      onLogRef.current?.({ level: "error", message });
    });
  }, [ready, analyser]);

  // Keyed on whether anyone is listening, not on the callback itself, so an
  // inline arrow from the parent does not tear the poll down every render.
  const watchProperties = Boolean(onProperties);

  useEffect(() => {
    const engine = engineRef.current;
    if (!ready || !engine || !watchProperties) return;

    return startPropertiesBridge(engine, (properties) => {
      onPropertiesRef.current?.(properties);
    });
  }, [ready, watchProperties]);

  // Use the loaded AST's intent: ordinary SDR sources do no HDR work. A draw
  // intensity expression opts in even when it currently evaluates to one/zero.
  useEffect(() => {
    const requested = engineRef.current?.get_hdr_2d_requested?.() ?? false;
    const eligible = autoHdr2D && Boolean(navigator.gpu) && requested;
    setHdrEligible(eligible);
    if (!eligible) setHdrPresenting(false);
    setAutoHdrStatus(!requested ? "SDR" : !navigator.gpu ? "WebGPU unavailable" : "Checking Viscript HDR scene");
  }, [autoHdr2D, ready, activationRevision]);

  const previewEnabled = hdrPreview || (autoHdr2D && hdrEligible);
  const isHdr2D = hdr2dPreview || autoHdr2D;

  // WASM keeps the SDR fallback alive. Sequence numbers apply each 2D frame once.
  useEffect(() => {
    if (!previewEnabled || !ready || !activated) {
      setHdrPresenting(false);
      if (hdr2dPreview) hdrDiagnosticRef.current?.(
        `HDR preview waiting: preview=${hdrPreview}, ready=${ready}, activated=${activated}`
      );
      return;
    }
    const canvas = hdrCanvasRef.current;
    const engine = engineRef.current;
    if (!canvas || !engine) {
      if (hdr2dPreview) hdrDiagnosticRef.current?.("HDR preview missing engine or canvas");
      return;
    }
    if (hdr2dPreview) hdrDiagnosticRef.current?.("HDR preview initializing WebGPU");
    let disposed = false;
    let raf = 0;
    let lastDiagnostic = "";
    let presenting = false;
    const controller = new AbortController();
    let renderer: { dispose(): void } | undefined;
    const fallback = (error: unknown) => {
      if (disposed) return;
      window.cancelAnimationFrame(raf);
      engine.set_hdr_2d_presenting?.(false);
      engine.set_hdr_2d_recording?.(false);
      const message = error instanceof Error ? error.message : String(error);
      setHdrPreviewError(message);
      setHdrPresenting(false);
      if (autoHdr2D) setAutoHdrStatus("HDR fallback: " + message);
      if (hdr2dPreview) hdrDiagnosticRef.current?.("HDR snapshot/render error: " + message);
      renderer?.dispose();
    };
    setHdrPreviewError("");
    setHdrPresenting(false);
    if (autoHdr2D) setAutoHdrStatus("Initializing WebGPU");
    const initialize = async () => {
      try {
        let drawFrame: () => boolean;
        if (isHdr2D) {
          const [{ WebGpu2DRenderer }, { readHdr2DFrame }] = await Promise.all([
            import("./webgpu-2d-renderer"), import("./hdr-2d-scene-bridge"),
          ]);
          if (disposed) return;
          const created = await WebGpu2DRenderer.create(canvas, {
            assets: applied.current?.assets, signal: controller.signal, onError: fallback,
          });
          if (disposed) { created.dispose(); return; }
          renderer = created;
          engine.set_hdr_2d_recording?.(true);
          drawFrame = () => {
            const frame = readHdr2DFrame(engine);
            const presented = created.render(frame, hdrIntensityRef.current);
            const message = `WebGPU extended · ${frame.commands.length} draw commands · ${frame.effects.length} effects`;
            if (hdr2dPreview && message !== lastDiagnostic) {
              lastDiagnostic = message;
              hdrDiagnosticRef.current?.(message);
            }
            return presented;
          };
        } else {
          const [{ HdrSceneRenderer }, { readHdrScene }] = await Promise.all([
            import("./webgpu-hdr-renderer"), import("./hdr-scene-bridge"),
          ]);
          if (disposed) return;
          const created = await HdrSceneRenderer.create(canvas);
          if (disposed) { created.dispose(); return; }
          renderer = created;
          drawFrame = () => { created.render(readHdrScene(engine), hdrIntensityRef.current); return true; };
        }
        if (autoHdr2D) setAutoHdrStatus("WebGPU ready; reading Viscript frames");
        const render = () => {
          if (disposed) return;
          try {
            const presented = drawFrame();
            if (autoHdr2D && presented && !presenting) {
              presenting = true;
              engine.set_hdr_2d_presenting?.(true);
              setHdrPresenting(true);
              setAutoHdrStatus("HDR active");
            }
            raf = window.requestAnimationFrame(render);
          } catch (error) { fallback(error); }
        };
        raf = window.requestAnimationFrame(render);
      } catch (error) {
        if (!disposed) {
          const message = error instanceof Error ? error.message : String(error);
          setHdrPreviewError(message);
          setHdrPresenting(false);
          if (autoHdr2D) setAutoHdrStatus("HDR setup failed: " + message);
          if (hdr2dPreview) hdrDiagnosticRef.current?.("WebGPU initialization error: " + message);
        }
      }
    };
    // Match the proven standalone 2D harness: avoid StrictMode cleanup
    // unconfiguring a canvas while its replacement initialization is in flight.
    const timer = window.setTimeout(() => { void initialize(); }, 0);
    return () => {
      disposed = true;
      controller.abort();
      engine.set_hdr_2d_presenting?.(false);
      engine.set_hdr_2d_recording?.(false);
      window.clearTimeout(timer);
      window.cancelAnimationFrame(raf);
      renderer?.dispose();
    };
  }, [previewEnabled, isHdr2D, ready, activated, activationRevision, autoHdr2D]);

  const watchParams = Boolean(onParams);

  useEffect(() => {
    const engine = engineRef.current;
    if (!ready || !engine || !watchParams) return;

    return startParamsBridge(engine, (params) => {
      onParamsRef.current?.(params);
    });
  }, [ready, watchParams]);

  const captureFrame = useCallback(async (): Promise<Blob> => {
    const engine = engineRef.current;
    if (
      !engine ||
      assetStatus !== "ready" ||
      activationError ||
      applied.current?.source !== source ||
      applied.current?.assets !== (assets ?? EMPTY_ASSETS) ||
      applied.current?.scope !== assetScope
    ) {
      throw new Error("The visualisation is not ready to capture yet");
    }
    return engine.capture_frame();
  }, [source, assets, assetScope, assetStatus, activationError]);

  useImperativeHandle(
    ref,
    () => ({
      captureFrame,
      setAnimationTime: (timeMs: number | null) => {
        engineRef.current?.set_animation_time(timeMs ?? undefined);
      },
      setParam: (name, value) => {
        const engine = engineRef.current;
        if (!engine) throw new Error("The visualisation engine is not ready");
        engine.set_param(name, JSON.stringify(value));
      },
      captureStream: (fps = 30) => {
        const canvas = stageRef.current?.querySelector("canvas");
        if (!(canvas instanceof HTMLCanvasElement))
          throw new Error("The visualisation canvas is not ready");
        return canvas.captureStream(fps);
      },
      queueInput: (packet: object | null) => {
        if (packet) engineRef.current?.queue_input(JSON.stringify(packet));
        else engineRef.current?.clear_input();
      },
    }),
    [captureFrame],
  );

  const pending = assetStatus !== "ready" || Boolean(activationError);
  return (
    <div className={className}>
      <div style={{ position: "relative", display: hdrPreview ? "flex" : "block", width: "100%", height: "100%", gap: hdrPreview ? 8 : 0 }}>
      <div style={{ position: "relative", width: hdrPreview ? "50%" : "100%", height: "100%", minWidth: 0 }}>
        {/* Drawing-buffer dimensions must never contribute to host layout. */}
        <div
          ref={stageRef}
          id={HOST_ID}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "hidden", opacity: autoHdr2D && previewEnabled && !hdrPreview && hdrPresenting && !pending ? 0 : 1 }}
        />
        {pending && !hideErrors && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              pointerEvents: "none",
              ...(!activated && posterUrl
                ? {
                    backgroundImage: `url(${JSON.stringify(posterUrl)})`,
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                  }
                : {}),
            }}
          >
            {(assetStatus !== "loading" || activationError) && (
              <div
                role="alert"
                style={{
                  pointerEvents: "auto",
                  maxWidth: "90%",
                  padding: "12px 16px",
                  borderRadius: 8,
                  color: "white",
                  background: "rgba(0,0,0,.8)",
                  fontSize: 14,
                }}
                onClick={(event) => event.stopPropagation()}
                onDoubleClick={(event) => event.stopPropagation()}
                onPointerDown={(event) => event.stopPropagation()}
              >
                Could not load visualisation assets.
                <>
                  <p style={{ overflowWrap: "anywhere" }}>
                    {activationError || assetPreparation?.missing.join(", ")}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setActivationError("");
                      assetPreparation?.retry();
                    }}
                    style={{ textDecoration: "underline", cursor: "pointer" }}
                  >
                    Retry
                  </button>
                </>
              </div>
            )}
          </div>
        )}
      </div>
      {previewEnabled && (
        <div style={autoHdr2D && !hdrPreview ? { position: "absolute", inset: 0, width: "100%", height: "100%", zIndex: 1, opacity: hdrPresenting && !pending ? 1 : 0, pointerEvents: "none" } : { width: "50%", minWidth: 0, position: "relative", height: "100%" }}>
          <canvas ref={hdrCanvasRef} aria-label="Experimental HDR WebGPU preview" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", display: "block" }} />
          {hdrCompositingWorkaround && <div aria-hidden="true" style={{ position: "absolute", inset: 0, pointerEvents: "none", backdropFilter: "blur(0px)", WebkitBackdropFilter: "blur(0px)" }} />}
          {hdrPreviewError && <div role="status" style={{ position: "absolute", left: 8, top: 8, background: "#171717", color: "#fff", padding: 8, fontSize: 12, maxWidth: "90%" }}>HDR preview unavailable: {hdrPreviewError}</div>}
        </div>
      )}
      {autoHdr2D && activated && !pending && process.env.NODE_ENV !== "production" && (
        <div role="status" style={{ position: "absolute", bottom: 0, left: 0, right: 0, zIndex: 2, pointerEvents: "none", fontSize: 11, opacity: .8, padding: "3px 6px" }}>
          HDR: {autoHdrStatus || (hdrEligible ? "Waiting for player" : "Not eligible")}
        </div>
      )}
      </div>
    </div>
  );
}

const EMPTY_ASSETS: ResolvedAsset[] = [];
