"use client";

import { VisampCanvas } from "@visamp/player";
import type { PointerEvent as ReactPointerEvent } from "react";

import { useFullscreen } from "@/hooks/use-fullscreen";
import { useChromeStore } from "@/lib/store/chrome";
import { useSessionStore } from "@/lib/store/session";

/**
 * The one and only canvas for the whole session (E2.1). It lives in the root
 * layout because App Router layouts preserve state and do not rerender across
 * segment navigation — so browsing never remounts the engine.
 */
export function CanvasLayer() {
  const booted = useSessionStore((s) => s.booted);
  const source = useSessionStore((s) => s.current.source);
  const { toggle: toggleFullscreen } = useFullscreen();

  // Clicking the visualisation clears the chrome at once, rather than waiting
  // out the idle fade. Hidden chrome toggles back — which is also what makes
  // tap-to-reveal work on touch, where there is no pointer movement to wake it.
  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    // The second press of a double-click is for fullscreen, not the chrome;
    // without this it would undo the first press and leave chrome up.
    if (event.detail > 1) return;

    const { visible, setVisible, hideNow } = useChromeStore.getState();
    if (visible) hideNow();
    else setVisible(true);
  };

  return (
    <div
      className="fixed inset-0 z-0"
      onPointerDown={onPointerDown}
      onDoubleClick={toggleFullscreen}
    >
      <VisampCanvas source={source} active={booted} className="h-full w-full" />
    </div>
  );
}
