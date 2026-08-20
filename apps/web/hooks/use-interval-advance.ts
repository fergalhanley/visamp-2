"use client";

import { useEffect } from "react";

import { useSessionStore } from "@/lib/store/session";

/**
 * E3.2 — in `time-interval` mode the visualisation advances on a timer through
 * the current playing context.
 */
export function useIntervalAdvance(): void {
  const mode = useSessionStore((s) => s.mode);
  const intervalSec = useSessionStore((s) => s.intervalSec);
  useEffect(() => {
    if (mode !== "time-interval") return;

    const id = window.setInterval(
      () => useSessionStore.getState().advance(1),
      intervalSec * 1000,
    );
    return () => window.clearInterval(id);
  }, [mode, intervalSec]);
}
