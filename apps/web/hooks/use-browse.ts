"use client";

import { useEffect, useState } from "react";

import { createClient } from "@/lib/supabase/client";
import type { Visualisation } from "@/lib/types";
import { artistFromProfile, visualisationFromRow } from "@/lib/visualisations";

interface Loaded<T> {
  items: T[];
  error: string | null;
}

/**
 * Public visualisations, newest first.
 *
 * `visibility = public` is filtered explicitly rather than left to RLS: the read
 * policy also admits the viewer's own private drafts, which belong in "My
 * Visualisations" and never in browse (§4).
 */
export function useBrowseVisualisations(): Loaded<Visualisation> & { loading: boolean } {
  const [state, setState] = useState<Loaded<Visualisation> | null>(null);

  useEffect(() => {
    let active = true;

    void createClient()
      .from("visualisations")
      .select("*, profiles!visualisations_owner_id_fkey(*)")
      .eq("visibility", "public")
      .order("created_at", { ascending: false })
      .limit(200)
      .then(({ data, error }) => {
        if (!active) return;

        setState({
          items: (data ?? []).map((row) =>
            visualisationFromRow(row, artistFromProfile(row.profiles)),
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
