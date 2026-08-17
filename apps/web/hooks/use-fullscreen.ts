"use client";

import { useCallback, useSyncExternalStore } from "react";

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
 */
export function useFullscreen(): { isFullscreen: boolean; toggle: () => void } {
  const isFullscreen = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const toggle = useCallback(() => {
    const doc = document as WebkitDocument;
    const element = document.documentElement as WebkitElement;

    if (doc.fullscreenElement ?? doc.webkitFullscreenElement) {
      void (doc.exitFullscreen?.() ?? doc.webkitExitFullscreen?.())?.catch(() => {});
    } else {
      void (
        element.requestFullscreen?.() ?? element.webkitRequestFullscreen?.()
      )?.catch(() => {});
    }
  }, []);

  return { isFullscreen, toggle };
}
