"use client";

import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type Ref,
} from "react";

import { parseDiagnostics, toCompileResult } from "./diagnostics";
import type {
  CompileResult,
  EngineModule,
  LogEntry,
  VisampCanvasHandle,
} from "./types";

/**
 * The crate looks this element up by id (`lib.rs`: `get_element_by_id("canvas")`),
 * so it is not configurable until the engine takes a canvas handle instead.
 */
const CANVAS_ID = "canvas";

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
  onCompileResult?: (result: CompileResult) => void;
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
 * `#[wasm_bindgen(start)]` function that runs on import, finds `#canvas`, and
 * parks its state in a `thread_local!`. That means **exactly one of these may
 * exist per page load**, which is why it belongs in the root layout and not in
 * a route segment.
 */
export function VisampCanvas({
  source,
  active,
  onCompileResult,
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
  const onLogRef = useRef(onLog);
  const onReadyRef = useRef(onReady);

  onCompileResultRef.current = onCompileResult;
  onLogRef.current = onLog;
  onReadyRef.current = onReady;

  useEffect(() => {
    if (process.env.NODE_ENV !== "production") {
      if (mountedOnce && !bootedRef.current) {
        console.warn(
          "[visamp] A second <VisampCanvas> mounted. The WASM module is a " +
            "singleton bound to #canvas; the newer instance will not render.",
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
  // import: `bootedRef` blocks the second run, leaving the engine showing its
  // own built-in demo forever.
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
  // `main_web()` has already compiled and started rendering its built-in demo
  // by the time we get here, so the first run replaces it.
  //
  // The engine keeps its Runtime (elapsed time, frame count) across a swap, so
  // there is no black frame — and a failed parse leaves the previous model in
  // place, which is what keeps the last good render on screen.
  useEffect(() => {
    const engine = engineRef.current;
    if (!ready || !engine) return;

    const result = toCompileResult(engine.load_script(source));
    // The engine also parks failures in its last-error slot, so remember what
    // we just reported and let the poller skip it rather than logging twice.
    reportedErrorRef.current = result.ok ? "" : (result.diagnostics[0]?.raw ?? "");
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

  const captureFrame = useCallback(async (): Promise<Blob> => {
    const engine = engineRef.current;
    if (!engine) {
      throw new Error("Engine is not ready yet");
    }
    return engine.capture_frame();
  }, []);

  useImperativeHandle(ref, () => ({ captureFrame }), [captureFrame]);

  return <canvas id={CANVAS_ID} className={className} />;
}
