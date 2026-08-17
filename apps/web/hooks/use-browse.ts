"use client";

import { useEffect, useState } from "react";

import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/database.types";
import type { Artist, Visualisation } from "@/lib/types";
import { artistFromProfile, visualisationFromRow } from "@/lib/visualisations";

type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];

interface Loaded<T> {
  items: T[];
  error: string | null;
}

/**
 * Public visualisations, newest first.
 *
 * `visibility = public` is filtered explicitly rather than left to RLS: the read
 * policy also admits unlisted rows, which are reachable by link but must never
 * appear in browse (§4).
 */
export function useBrowseVisualisations(): Loaded<Visualisation> & { loading: boolean } {
  const [state, setState] = useState<Loaded<Visualisation> | null>(null);

  useEffect(() => {
    let active = true;

    void createClient()
      .from("visualisations")
      .select("*, profiles(*)")
      .eq("visibility", "public")
      .order("created_at", { ascending: false })
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

/** Artists with at least one public visualisation — vis_count only counts public. */
export function useArtists(): Loaded<Artist> & { loading: boolean } {
  const [state, setState] = useState<Loaded<Artist> | null>(null);

  useEffect(() => {
    let active = true;

    void createClient()
      .from("profiles")
      .select("*")
      .gt("vis_count", 0)
      .order("vis_count", { ascending: false })
      .then(({ data, error }) => {
        if (!active) return;

        setState({
          items: (data ?? []).map((row: ProfileRow) => artistFromProfile(row)),
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
