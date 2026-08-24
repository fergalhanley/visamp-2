"use client";

import { useEffect, useRef } from "react";

import { createClient } from "@/lib/supabase/client";
import { useSessionStore } from "@/lib/store/session";

/**
 * Counts a view each time something new starts playing.
 *
 * Every view counts, once: no per-viewer dedupe, because watching is anonymous
 * and there is nothing to dedupe against. The ref guard is only there to stop
 * the same visualisation being counted twice for one arrival — StrictMode runs
 * every effect twice in development, and the store notifies on unrelated
 * changes to `current`.
 *
 * Fires for database-backed work only. The built-in default and the local
 * fixtures have no row to count against; `ownerId` is what separates them.
 */
export function useViewCount(): void {
  // Two fields rather than `current` itself: the store hands back a new object
  // on every change — including this hook's own — and subscribing to it would
  // re-render the whole shell each time.
  const id = useSessionStore((s) => s.current.id);
  const ownerId = useSessionStore((s) => s.current.ownerId);
  const counted = useRef<string | null>(null);

  useEffect(() => {
    if (!ownerId || counted.current === id) return;
    counted.current = id;

    void createClient()
      .rpc("record_vis_view", { vis_id: id })
      .then(({ error }) => {
        // A view that fails to record is not worth telling the viewer about,
        // but showing a number that never moved is worse than a console line.
        if (error) {
          console.warn("[visamp] view not recorded:", error.message);
          return;
        }
        useSessionStore.getState().countView(id);
      });
  }, [id, ownerId]);
}
