"use client";

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
import { parseDiagnostics, toCompileResult } from "./diagnostics";
import type {
  CompileResult,
  EngineModule,
  LogEntry,
  PropertyView,
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

  // Applies the source once the engine exists, and on every later change.
  // `main_web()` mounts no canvas and draws nothing until this runs, so the
  // first pass is what puts anything on screen at all.
  //
  // The engine keeps its Runtime (elapsed time, frame count) across a swap, so
  // there is no black frame — and a failed parse leaves the previous model in
  // place, which is what keeps the last good render on screen.
  useEffect(() => {
    const engine = engineRef.current;
    if (!ready || !engine) return;

    let result: CompileResult;
    let rawError = "";

    try {
      rawError = engine.load_script(source);
      result = toCompileResult(rawError);
    } catch (error) {
      rawError = String(error);
      // A panic inside the wasm module surfaces here as a thrown exception.
      // Left uncaught it escapes through React and takes the whole editor down
      // with an error overlay — over a half-typed keyword. Report it as a
      // diagnostic instead; the last good render stays on screen.
      result = {
        ok: false,
        usesAudio: false,
        diagnostics: [
          {
            severity: "error",
            message:
              error instanceof Error
                ? `Engine error: ${error.message.split("\n")[0]}`
                : "The engine failed on this script",
            raw: String(error),
          },
        ],
      };
    }

    // The engine also parks failures in its last-error slot, so remember what
    // we just reported and let the poller skip it rather than logging twice.
    //
    // The whole string, not the first diagnostic: a compile can now turn up
    // several problems at once, and the engine parks all of them together.
    // Comparing against one of them would never match, and every error would
    // be logged twice.
    reportedErrorRef.current = result.ok ? "" : rawError;
    onCompileResultRef.current?.(result);
  }, [ready, source]);

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
        onLogRef.current?.({
          level: "error",
          message: parseDiagnostics(error)[0]?.message ?? error,
        });
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
    if (!engine) {
      throw new Error("Engine is not ready yet");
    }
    return engine.capture_frame();
  }, []);

  useImperativeHandle(ref, () => ({ captureFrame }), [captureFrame]);

  return <div id={HOST_ID} className={className} />;
}
