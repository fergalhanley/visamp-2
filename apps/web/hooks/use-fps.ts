"use client";

import { useEffect, useState } from "react";

/** How often the reading refreshes. Long enough to be steady, short enough to react. */
const WINDOW_MS = 500;

/**
 * Frames per second, measured from the browser's own animation callbacks.
 *
 * This is the page's frame rate rather than a number reported by the engine.
 * They are the same thing in practice — the engine draws once per animation
 * frame — and measuring here means a script that stalls the main thread shows
 * up honestly, which a self-reported figure could hide.
 */
export function useFps(): number {
  const [fps, setFps] = useState(0);

  useEffect(() => {
    let frames = 0;
    let since = performance.now();
    let raf = 0;

    const tick = (now: number) => {
      frames += 1;

      const elapsed = now - since;
      if (elapsed >= WINDOW_MS) {
        setFps(Math.round((frames * 1000) / elapsed));
        frames = 0;
        since = now;
      }

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return fps;
}
