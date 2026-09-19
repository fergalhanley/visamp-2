"use client";

import { useEffect, useRef } from "react";

import { findVisualisation } from "@/lib/fixtures/visualisations";
import { useSessionStore } from "@/lib/store/session";
import type { Visualisation } from "@/lib/types";
import { visualisationPath } from "@/lib/visualisation-url";

/** Keep the engine mounted while recording canonical URLs and real history. */
export function useVisRouteSync(): void {
  const current = useSessionStore((s) => s.current);
  const lastPushed = useRef<string | null>(null);
  const visited = useRef(new Map<string, Visualisation>());

  useEffect(() => {
    const path = visualisationPath(current);
    visited.current.set(path, current);
    if (lastPushed.current === null) {
      lastPushed.current = path;
      return;
    }
    if (lastPushed.current === path) return;
    lastPushed.current = path;
    if (window.location.pathname !== path) window.history.pushState(null, "", path);
  }, [current]);

  useEffect(() => {
    const onPopState = () => {
      const path = window.location.pathname;
      const match = /^\/vis\/([^/]+)$/.exec(path);
      const vis = visited.current.get(path) ?? (match?.[1] ? findVisualisation(match[1]) : undefined);
      if (!vis) return;
      lastPushed.current = visualisationPath(vis);
      useSessionStore.getState().select(vis);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);
}
