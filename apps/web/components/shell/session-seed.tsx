"use client";

import { useEffect } from "react";

import { useSessionStore } from "@/lib/store/session";
import type { Visualisation } from "@/lib/types";

/**
 * Starts the session on a server-chosen visualisation.
 *
 * The player has no gate in front of it, so whatever is playing has to be right
 * from the first frame. Deciding it on the server avoids showing a placeholder
 * and swapping it out once the browse list arrives.
 */
export function SessionSeed({ vis }: { vis: Visualisation }) {
  useEffect(() => {
    useSessionStore.getState().select(vis);
  }, [vis]);

  return null;
}
