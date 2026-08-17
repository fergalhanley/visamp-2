"use client";

import { useEffect, useRef } from "react";

import { findVisualisation } from "@/lib/fixtures/visualisations";
import { useSessionStore } from "@/lib/store/session";

/**
 * E2.10 — selecting a visualisation swaps source into the live engine and
 * pushes `/vis/<id>`. `window.history.pushState` is wired into the Next router,
 * so `usePathname` stays in sync without a navigation that would remount the
 * canvas.
 */
export function useVisRouteSync(): void {
  const currentId = useSessionStore((s) => s.current.id);
  const lastPushed = useRef<string | null>(null);

  useEffect(() => {
    // Skip the first run: the URL already describes what's on screen, and
    // pushing here would put a duplicate entry in the history stack.
    if (lastPushed.current === null) {
      lastPushed.current = currentId;
      return;
    }
    if (lastPushed.current === currentId) return;

    lastPushed.current = currentId;
    window.history.pushState(null, "", `/vis/${currentId}`);
  }, [currentId]);

  // Back/forward should move through the visualisations that were pushed.
  useEffect(() => {
    const onPopState = () => {
      const match = /^\/vis\/([^/]+)/.exec(window.location.pathname);
      const vis = match?.[1] ? findVisualisation(match[1]) : undefined;
      if (!vis) return;

      lastPushed.current = vis.id;
      useSessionStore.getState().select(vis);
    };

    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);
}
