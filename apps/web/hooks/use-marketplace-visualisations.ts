"use client";

import { useEffect, useState } from "react";

import type { Visualisation } from "@/lib/types";

interface State {
  items: Visualisation[];
  error: string | null;
}

/** Visuals eligible for Video Maker: public, protected and priced products. */
export function useMarketplaceVisualisations(): State & { loading: boolean } {
  const [state, setState] = useState<State | null>(null);

  useEffect(() => {
    let active = true;

    void fetch("/api/studio/visuals", { cache: "no-store" })
      .then(async (response) => {
        const payload = (await response.json()) as {
          visualisations?: Visualisation[];
          error?: string;
        };
        if (!response.ok)
          throw new Error(payload.error ?? "Could not load visuals.");
        if (active)
          setState({
            items: payload.visualisations ?? [],
            error: null,
          });
      })
      .catch((error) => {
        if (active)
          setState({
            items: [],
            error:
              error instanceof Error
                ? error.message
                : "Could not load visuals.",
          });
      });

    return () => {
      active = false;
    };
  }, []);

  return {
    items: state?.items ?? [],
    error: state?.error ?? null,
    loading: state === null,
  };
}
