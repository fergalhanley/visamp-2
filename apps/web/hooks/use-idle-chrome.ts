"use client";

import { useEffect } from "react";

import { useChromeStore } from "@/lib/store/chrome";

/** E2.2 — how long the cursor must rest before the chrome fades away. */
const IDLE_MS = 3000;

/**
 * Chrome is earned, not given: cursor movement reveals it, stillness hides it.
 * An open panel suppresses the fade so the chrome never disappears out from
 * under someone who is reading it.
 *
 * Pointer *down* is deliberately not a wake signal — a click on the
 * visualisation dismisses the chrome (see CanvasLayer), and waking here would
 * immediately undo that.
 */
export function useIdleChrome(idleMs: number = IDLE_MS): void {
  const visible = useChromeStore((s) => s.visible);

  useEffect(() => {
    let timer: number | undefined;

    const schedule = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        const { vOpen, aOpen, setVisible } = useChromeStore.getState();
        if (!vOpen && !aOpen) setVisible(false);
      }, idleMs);
    };

    // Read through getState so this effect never re-subscribes on every move.
    const wake = () => {
      useChromeStore.getState().setVisible(true);
      schedule();
    };

    window.addEventListener("pointermove", wake, { passive: true });
    window.addEventListener("keydown", wake);

    // Re-arm whenever the chrome becomes visible, including reveals that came
    // from a tap rather than from movement.
    if (visible) schedule();

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("pointermove", wake);
      window.removeEventListener("keydown", wake);
    };
  }, [idleMs, visible]);
}
