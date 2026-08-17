"use client";

import { useCallback, useEffect, useState } from "react";

import { useAuth } from "@/components/auth/auth-provider";
import { createClient } from "@/lib/supabase/client";
import type { Artist, Visualisation } from "@/lib/types";
import { visualisationFromRow } from "@/lib/visualisations";

interface Fetched {
  userId: string;
  items: Visualisation[];
  error: string | null;
}

/**
 * The signed-in viewer's own work, newest edit first.
 *
 * No visibility filter: RLS already returns exactly what this user may see, and
 * for their own rows that includes private drafts — which is the point, since
 * a brand-new visualisation starts private.
 */
export function useMyVisualisations(): {
  items: Visualisation[] | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
} {
  const { user, profile } = useAuth();
  const [fetched, setFetched] = useState<Fetched | null>(null);
  const [nonce, setNonce] = useState(0);

  const userId = user?.id ?? null;

  useEffect(() => {
    if (!userId) return;

    let active = true;

    void createClient()
      .from("visualisations")
      .select("*")
      .eq("owner_id", userId)
      .order("updated_at", { ascending: false })
      .then(({ data, error }) => {
        if (!active) return;

        // The artist is the viewer themselves; the counters on it are only used
        // by artist tiles, which this list never renders.
        const artist: Artist = {
          username: profile?.username ?? "you",
          displayName: profile?.display_name ?? profile?.username ?? "You",
          avatarUrl: profile?.avatar_url ?? undefined,
          visCount: profile?.vis_count ?? 0,
          totalViews: profile?.total_views ?? 0,
        };

        setFetched({
          userId,
          items: (data ?? []).map((row) => visualisationFromRow(row, artist)),
          error: error?.message ?? null,
        });
      });

    return () => {
      active = false;
    };
  }, [userId, profile, nonce]);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  // Derived, so signing out drops the list without an extra render pass and a
  // previous user's work can never appear under a new session.
  const current = userId && fetched?.userId === userId ? fetched : null;

  return {
    items: userId ? (current?.items ?? null) : null,
    loading: Boolean(userId) && current === null,
    error: current?.error ?? null,
    refresh,
  };
}
