"use client";

import { useEffect, useState } from "react";

import { createClient } from "@/lib/supabase/client";
import type { Visualisation } from "@/lib/types";
import {
  creatorFromProfile,
  visualisationFromRow,
} from "@/lib/visualisations";

interface State {
  items: Visualisation[];
  error: string | null;
}

/** Public, priced visualisations available for musicians to audition. */
export function useMarketplaceVisualisations(): State & { loading: boolean } {
  const [state, setState] = useState<State | null>(null);

  useEffect(() => {
    let active = true;

    void createClient()
      .from("visualisations")
      .select("*, profiles!visualisations_owner_id_fkey(*)")
      .eq("visibility", "public")
      .eq("marketplace_listed", true)
      .not("marketplace_price_credits", "is", null)
      .order("updated_at", { ascending: false })
      .limit(200)
      .then(({ data, error }) => {
        if (!active) return;
        setState({
          items: (data ?? []).map((row) =>
            visualisationFromRow(row, creatorFromProfile(row.profiles)),
          ),
          error: error?.message ?? null,
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
