"use client";

import { useEffect, useState } from "react";

import { createClient } from "@/lib/supabase/client";
import type { Visualisation } from "@/lib/types";
import { artistFromProfile, visualisationFromRow } from "@/lib/visualisations";

// Named FK, as everywhere else: `likes` is a junction table, so a bare
// `profiles(...)` embed is ambiguous.
const SELECT = "*, profiles!visualisations_owner_id_fkey(*)";

export interface Forks {
  items: Visualisation[] | null;
  error: string | null;
}

/**
 * Everything forked from this visualisation, newest first (E6.11).
 *
 * RLS does the filtering: a private fork is visible only to whoever made it.
 * That means the list can be shorter than `forkCount`, which counts every fork
 * ever made — the dialog says so rather than quietly disagreeing with itself.
 *
 * Only loads while `active`, so the dialog costs nothing until it is opened.
 */
export function useForks(visId: string, active: boolean): Forks {
  const [state, setState] = useState<Forks>({ items: null, error: null });

  useEffect(() => {
    if (!active) return;

    let live = true;
    void createClient()
      .from("visualisations")
      .select(SELECT)
      .eq("forked_from_id", visId)
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (!live) return;
        setState({
          items: (data ?? []).map((row) =>
            visualisationFromRow(row, artistFromProfile(row.profiles)),
          ),
          error: error?.message ?? null,
        });
      });

    return () => {
      live = false;
    };
  }, [visId, active]);

  return state;
}

/**
 * The visualisation this one was forked from, or null.
 *
 * Null covers three cases the player treats the same way: never forked, forked
 * from something since deleted (`on delete set null`), and forked from a draft
 * that has since gone private — RLS simply returns nothing for the last one.
 *
 * Loaded whole rather than as a name, because the link both labels itself and
 * hands the row to the player when clicked.
 */
export function useParentVis(parentId: string | undefined): Visualisation | null {
  const [parent, setParent] = useState<Visualisation | null>(null);

  useEffect(() => {
    if (!parentId) return;

    let live = true;
    void createClient()
      .from("visualisations")
      .select(SELECT)
      .eq("id", parentId)
      .maybeSingle()
      .then(({ data }) => {
        if (!live || !data) return;
        setParent(visualisationFromRow(data, artistFromProfile(data.profiles)));
      });

    return () => {
      live = false;
    };
  }, [parentId]);

  // Keyed on the id it was fetched for, so a stale parent never labels a new
  // visualisation while the next fetch is in flight.
  return parent?.id === parentId ? parent : null;
}
