"use client";

import { activateScript } from "./activation";
import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type Ref,
} from "react";

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
  /** DSL source to run. */
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
   * Setting it back to false does not stop the render loop — the current crate
   * starts `requestAnimationFrame` in its wasm-bindgen start function and has
   * no pause entry point.
   */
  active: boolean;
  /**
   * Analyser to sample for `$TIME_DOMAIN_DATA`, `$FREQUENCY_DATA` and `$BEAT`.
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
  analyser,
  onCompileResult,
  onProperties,
  onLog,
  onReady,
  className,
  ref,
}: VisampCanvasProps) {
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

  // Apply effects once to the completed canvas in the browser compositor.
  // Doing this in the player avoids filtering every 2D primitive and works
  // equally for canvases backed by WebGL.
  useEffect(() => {
    if (!active || !ready) return;

    let animationFrame = 0;
    let previous = "";
    let previousCanvas: HTMLCanvasElement | null = null;
    const syncFilter = () => {
      const engine = engineRef.current;
      const canvas = document.querySelector<HTMLCanvasElement>(
        `#${HOST_ID} > canvas`,
      );
      if (engine && canvas) {
        const filter = engine.get_canvas_filter();
        if (filter !== previous || canvas !== previousCanvas) {
          canvas.style.filter = filter || "none";
          previous = filter;
          previousCanvas = canvas;
        }
      }
      animationFrame = window.requestAnimationFrame(syncFilter);
    };

    animationFrame = window.requestAnimationFrame(syncFilter);
    return () => window.cancelAnimationFrame(animationFrame);
  }, [active, ready]);

  // Runs only while there is something to listen to, so a silent session
  // costs no per-frame work.
  useEffect(() => {
    const engine = engineRef.current;
    if (!ready || !engine || !analyser) return;

    return startAudioBridge(engine, analyser);
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

  useImperativeHandle(ref, () => ({ captureFrame }), [captureFrame]);

  const pending = assetStatus !== "ready" || Boolean(activationError);
  return (
    <div className={className}>
      <div style={{ position: "relative", width: "100%", height: "100%" }}>
        <div id={HOST_ID} style={{ width: "100%", height: "100%" }} />
        {pending && (
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
            <div
              role={
                assetStatus === "error" || activationError ? "alert" : "status"
              }
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
              {assetStatus === "loading"
                ? "Loading assets…"
                : "Could not load visualisation assets."}
              {assetStatus !== "loading" && (
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
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const EMPTY_ASSETS: ResolvedAsset[] = [];
