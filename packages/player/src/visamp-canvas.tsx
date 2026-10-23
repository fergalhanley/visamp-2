"use client";

import { activateScript } from "./activation";
import { shouldPresentHdr2D } from "./hdr-2d-presentation";
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
import { startPropertiesBridge } from "./properties-bridge";
import { toRuntimeLog, toCompileResult } from "./diagnostics";
import type {
  CompileResult,
  EngineModule,
  LogEntry,
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
  /** Automatically select supported HDR 2D playback; SDR remains fallback. */
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
  assets,
  assetPreparation,
  posterUrl,
  active,
  interactive = false,
  hideErrors = false,
  hdrPreview = false,
  hdr2dPreview = false,
  autoHdr2D = false,
  onHdr2DDiagnostic,
  hdrIntensity = 1,
  hdrCompositingWorkaround = false,
  analyser,
  onCompileResult,
  onProperties,
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
  const onLogRef = useRef(onLog);
  const onReadyRef = useRef(onReady);

  onCompileResultRef.current = onCompileResult;
  onPropertiesRef.current = onProperties;
  onLogRef.current = onLog;
  onReadyRef.current = onReady;

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
  }, [ready, source, assets, assetStatus, assetScope]);

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

  // Eligibility is a hint, never a guarantee of working HDR presentation.
  // Unsupported script features are handled by the live snapshot fallback.
  useEffect(() => {
    if (!autoHdr2D) { setHdrEligible(false); setHdrPresenting(false); setAutoHdrStatus(""); return; }
    const media = window.matchMedia("(dynamic-range: high)");
    // dynamic-range is advisory: false negatives occur with some browser/display
    // combinations. The WebGPU configuration and actual frame decide viability.
    const update = () => setHdrEligible(Boolean(navigator.gpu)
      // Viscript defaults to 2D when the context declaration is omitted.
      && !/^\s*context\s+3d\b/m.test(source)
      && /\bintensity\s*:/m.test(source));
    update();
    setAutoHdrStatus(!navigator.gpu ? "WebGPU unavailable" : "Checking Viscript HDR scene");
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [autoHdr2D, source]);

  const previewEnabled = hdrPreview || (autoHdr2D && hdrEligible);
  const isHdr2D = hdr2dPreview || autoHdr2D;

  // Side-by-side diagnostic only: WASM continues to render through WebGL.
  // The snapshot contains last-frame geometry, so WebGPU may trail by a tick.
  useEffect(() => {
    if (!previewEnabled || !ready || !active || !activated) {
      if (hdr2dPreview) hdrDiagnosticRef.current?.(
        `HDR preview waiting: preview=${hdrPreview}, ready=${ready}, active=${active}, activated=${activated}`
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
    let lastPresented = false;
    let renderer: import("./webgpu-hdr-renderer").HdrSceneRenderer | undefined;
    setHdrPreviewError("");
    setHdrPresenting(false);
    if (autoHdr2D) setAutoHdrStatus("Initializing WebGPU");
    const initialize = async () => {
      try {
        const [{ HdrSceneRenderer }, { readHdrScene }, { readHdr2DScene }] = await Promise.all([
          import("./webgpu-hdr-renderer"),
          import("./hdr-scene-bridge"),
          import("./hdr-2d-scene-bridge"),
        ]);
        if (disposed) return;
        const created = await HdrSceneRenderer.create(canvas, isHdr2D ? "extended" : undefined);
        if (disposed) { created.dispose(); return; }
        renderer = created;
        if (autoHdr2D) setAutoHdrStatus("WebGPU ready; reading Viscript frames");
        if (hdr2dPreview) hdrDiagnosticRef.current?.("WebGPU initialized; awaiting live Rust frame");
        const render = () => {
          if (disposed) return;
          try {
            const scene = isHdr2D ? readHdr2DScene(engine) : readHdrScene(engine);
            if (hdr2dPreview && hdrDiagnosticRef.current) {
              const peak = scene.triangles.reduce((max, triangle) =>
                Math.max(max, triangle.color[0], triangle.color[1], triangle.color[2]), 0);
              const message = `WebGPU extended ready · ${scene.triangles.length} triangles · peak RGB ${peak.toFixed(2)}× SDR reference`;
              if (message !== lastDiagnostic) {
                lastDiagnostic = message;
                hdrDiagnosticRef.current(message);
              }
            }
            renderer?.render(scene, hdrIntensityRef.current);
            if (autoHdr2D && isHdr2D) {
              const luminous = shouldPresentHdr2D(scene);
              if (luminous !== lastPresented) {
                lastPresented = luminous;
                setHdrPresenting(luminous);
              }
              if (luminous) setAutoHdrStatus("HDR active");
              else setAutoHdrStatus("No HDR-bright shapes in frame");
            }
            raf = window.requestAnimationFrame(render);
          } catch (error) {
            setHdrPreviewError(error instanceof Error ? error.message : String(error));
            setHdrPresenting(false);
            if (autoHdr2D) setAutoHdrStatus("HDR fallback: " + String(error));
            if (hdr2dPreview) hdrDiagnosticRef.current?.("HDR snapshot/render error: " + String(error));
          }
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
      window.clearTimeout(timer);
      window.cancelAnimationFrame(raf);
      renderer?.dispose();
    };
  }, [previewEnabled, isHdr2D, ready, active, activated, activationRevision, autoHdr2D]);

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
        <div
          ref={stageRef}
          id={HOST_ID}
          style={{ width: "100%", height: "100%" }}
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
        <div style={autoHdr2D && !hdrPreview ? { position: "absolute", inset: 0, width: "100%", height: "100%", zIndex: 1, opacity: hdrPresenting ? 1 : 0, pointerEvents: "none" } : { width: "50%", minWidth: 0, position: "relative", height: "100%" }}>
          <canvas ref={hdrCanvasRef} aria-label="Experimental HDR WebGPU preview" style={{ width: "100%", height: "100%", display: "block" }} />
          {hdrCompositingWorkaround && <div aria-hidden="true" style={{ position: "absolute", inset: 0, pointerEvents: "none", backdropFilter: "blur(0px)", WebkitBackdropFilter: "blur(0px)" }} />}
          {hdrPreviewError && <div role="status" style={{ position: "absolute", left: 8, top: 8, background: "#171717", color: "#fff", padding: 8, fontSize: 12, maxWidth: "90%" }}>HDR preview unavailable: {hdrPreviewError}</div>}
        </div>
      )}
      </div>
      {autoHdr2D && process.env.NODE_ENV !== "production" && (
        <div role="status" style={{ fontSize: 11, opacity: .8, padding: "3px 6px" }}>
          HDR: {autoHdrStatus || (hdrEligible ? "Waiting for player" : "Not eligible")}
        </div>
      )}
    </div>
  );
}

const EMPTY_ASSETS: ResolvedAsset[] = [];
