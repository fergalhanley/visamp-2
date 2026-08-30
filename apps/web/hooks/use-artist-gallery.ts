"use client";

import { useEffect, useState } from "react";

import { createClient } from "@/lib/supabase/client";
import type { Artist, Visualisation } from "@/lib/types";
import { artistFromProfile, visualisationFromRow } from "@/lib/visualisations";

/** An artist plus the numbers the gallery sorts on. */
export interface ArtistStats {
  /** The profile id, which is what their work is keyed by. */
  id: string;
  artist: Artist;
  visCount: number;
  views: number;
  likes: number;
}

interface Gallery {
  items: ArtistStats[];
  loading: boolean;
  error: string | null;
}

/**
 * Every artist with public work, with their totals.
 *
 * Views come off `profiles.total_views`, which a trigger maintains. Likes have
 * no such column, so they are summed here from the like counts of the public
 * work itself — one narrow query over two columns, rather than a migration for
 * a number only this page reads.
 */
export function useArtistGallery(): Gallery {
  const [state, setState] = useState<Gallery>({
    items: [],
    loading: true,
    error: null,
  });

  useEffect(() => {
    let live = true;
    const supabase = createClient();

    void Promise.all([
      supabase.from("profiles").select("*").gt("vis_count", 0),
      supabase
        .from("visualisations")
        .select("owner_id, like_count")
        .eq("visibility", "public"),
    ]).then(([profiles, work]) => {
      if (!live) return;

      const likesByOwner = new Map<string, number>();
      for (const row of work.data ?? []) {
        likesByOwner.set(
          row.owner_id,
          (likesByOwner.get(row.owner_id) ?? 0) + row.like_count,
        );
      }

      setState({
        items: (profiles.data ?? []).map((profile) => ({
          id: profile.id,
          artist: artistFromProfile(profile),
          visCount: profile.vis_count,
          views: profile.total_views,
          likes: likesByOwner.get(profile.id) ?? 0,
        })),
        loading: false,
        error: profiles.error?.message ?? work.error?.message ?? null,
      });
    });

    return () => {
      live = false;
    };
  }, []);

  return state;
}

/**
 * One artist's public work, newest first. Loaded per selection rather than all
 * at once, because each row carries its whole script.
 */
export function useArtistWork(ownerId: string | null): {
  items: Visualisation[];
  loading: boolean;
} {
  const [state, setState] = useState<{ ownerId: string; items: Visualisation[] } | null>(
    null,
  );

  useEffect(() => {
    if (!ownerId) return;

    let live = true;
    void createClient()
      .from("visualisations")
      .select("*, profiles!visualisations_owner_id_fkey(*)")
      .eq("owner_id", ownerId)
      .eq("visibility", "public")
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        if (!live) return;
        setState({
          ownerId,
          items: (data ?? []).map((row) =>
            visualisationFromRow(row, artistFromProfile(row.profiles)),
          ),
        });
      });

    return () => {
      live = false;
    };
  }, [ownerId]);

  // Keyed on who it was fetched for, so switching artists never shows the
  // previous one's work while the next query is in flight.
  const fresh = state?.ownerId === ownerId;
  return { items: fresh ? state.items : [], loading: Boolean(ownerId) && !fresh };
}
