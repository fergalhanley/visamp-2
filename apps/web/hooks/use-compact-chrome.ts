"use client";

import { useSyncExternalStore } from "react";

/**
 * E2.11 — when to swap hover-to-reveal for tap-to-reveal and side panels for
 * bottom sheets.
 *
 * Pointer type alone is not enough. A coarse pointer catches real phones, but
 * a narrow desktop window would still get hover chrome and a 20px hot zone
 * squeezed against a 352px panel, and some environments (device emulators,
 * hybrids) never report coarse at all. Width is the honest second signal.
 */
const QUERY = "(pointer: coarse), (max-width: 768px)";

function subscribe(onChange: () => void): () => void {
  const query = window.matchMedia(QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function getSnapshot(): boolean {
  return window.matchMedia(QUERY).matches;
}

/** The server has no viewport; assume the desktop layout. */
function getServerSnapshot(): boolean {
  return false;
}

export function useCompactChrome(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
