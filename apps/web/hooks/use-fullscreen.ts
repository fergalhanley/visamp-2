"use client";

import { useSyncExternalStore, type RefObject } from "react";

/** Safari still ships the prefixed API. */
interface WebkitDocument extends Document {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void>;
}
interface WebkitElement extends HTMLElement {
  webkitRequestFullscreen?: () => Promise<void>;
}

function subscribe(onChange: () => void): () => void {
  document.addEventListener("fullscreenchange", onChange);
  document.addEventListener("webkitfullscreenchange", onChange);
  return () => {
    document.removeEventListener("fullscreenchange", onChange);
    document.removeEventListener("webkitfullscreenchange", onChange);
  };
}

function getSnapshot(): boolean {
  const doc = document as WebkitDocument;
  return Boolean(doc.fullscreenElement ?? doc.webkitFullscreenElement);
}

function getServerSnapshot(): boolean {
  return false;
}

/**
 * Escape is handled by the browser itself — it exits fullscreen without the
 * page seeing a keydown, and `fullscreenchange` brings our state back in line.
 *
 * @param target Element to expand. Defaults to the whole document, which is
 *   what the player wants; the editor passes its preview so the visualisation
 *   fills the screen on its own rather than dragging the code panel with it.
 */
export function useFullscreen(target?: RefObject<HTMLElement | null>): {
  isFullscreen: boolean;
  toggle: () => void;
} {
  const isFullscreen = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  // Not memoised: it reads `target.current` at click time, which is exactly the
  // ref access that defeats memoisation analysis — and there is nothing to gain
  // here, since the returned object is fresh each render regardless.
  const toggle = () => {
    const doc = document as WebkitDocument;

    if (doc.fullscreenElement ?? doc.webkitFullscreenElement) {
      void (doc.exitFullscreen?.() ?? doc.webkitExitFullscreen?.())?.catch(() => {});
      return;
    }

    const element = (target?.current ?? document.documentElement) as WebkitElement;
    void (
      element.requestFullscreen?.() ?? element.webkitRequestFullscreen?.()
    )?.catch(() => {});
  };

  return { isFullscreen, toggle };
}
