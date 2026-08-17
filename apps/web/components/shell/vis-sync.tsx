"use client";

import { useEffect } from "react";

import { useSessionStore } from "@/lib/store/session";
import type { Visualisation } from "@/lib/types";

/**
 * Hands a server-rendered route's visualisation to the live session.
 *
 * Only runs on a real segment render — a warm swap (E2.10) uses
 * `history.pushState`, which deliberately does not re-render the page, so this
 * cannot loop back on itself.
 */
export function VisSync({ vis }: { vis: Visualisation }) {
  useEffect(() => {
    useSessionStore.getState().select(vis);
  }, [vis]);

  return null;
}
