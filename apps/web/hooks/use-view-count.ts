"use client";

import { useEffect, useRef } from "react";

import { useSessionStore } from "@/lib/store/session";

/**
 * Counts a view each time something new starts playing.
 *
 * The server deduplicates a viewer for 24 hours and caps cookie-reset traffic
 * per network. The ref also avoids a redundant request when StrictMode runs an
 * effect twice in development.
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
    const timer = window.setTimeout(() => {
      counted.current = id;
      void fetch(`/api/visualisations/${encodeURIComponent(id)}/view`, {
        method: "POST",
        credentials: "same-origin",
      })
        .then(async (response) => {
          const result = (await response.json()) as {
            counted?: boolean;
            error?: string;
          };
          if (!response.ok)
            throw new Error(result.error ?? "View was not recorded");
          if (result.counted) useSessionStore.getState().countView(id);
        })
        .catch((error: unknown) => {
          console.warn(
            "[visamp] view not recorded:",
            error instanceof Error ? error.message : error,
          );
        });
    }, 5_000);

    return () => window.clearTimeout(timer);
  }, [id, ownerId]);
}
