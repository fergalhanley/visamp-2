"use client";

import { useCallback, useEffect, useState } from "react";

import { useAuth } from "@/components/auth/auth-provider";
import { createClient } from "@/lib/supabase/client";
import type { Visualisation } from "@/lib/types";
import { creatorFromProfile, visualisationFromRow } from "@/lib/visualisations";

interface Fetched {
  userId: string;
  items: Visualisation[];
  error: string | null;
}

/** The signed-in viewer's likes, newest favourite first. */
export function useFavouriteVisualisations(): {
  items: Visualisation[] | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
} {
  const { user } = useAuth();
  const [fetched, setFetched] = useState<Fetched | null>(null);
  const [nonce, setNonce] = useState(0);
  const userId = user?.id ?? null;
  const refresh = useCallback(() => setNonce((value) => value + 1), []);

  useEffect(() => {
    if (!userId) return;

    let active = true;
    void createClient()
      .from("likes")
      .select(
        "created_at, visualisations!likes_vis_id_fkey(*, profiles!visualisations_owner_id_fkey(*))",
      )
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(500)
      .then(({ data, error }) => {
        if (!active) return;
        setFetched({
          userId,
          items: (data ?? []).flatMap((like) => {
            const vis = like.visualisations;
            return vis
              ? [visualisationFromRow(vis, creatorFromProfile(vis.profiles))]
              : [];
          }),
          error: error?.message ?? null,
        });
      });

    return () => {
      active = false;
    };
  }, [userId, nonce]);

  useEffect(() => {
    window.addEventListener("visamp:likes-changed", refresh);
    return () => window.removeEventListener("visamp:likes-changed", refresh);
  }, [refresh]);

  const current = userId && fetched?.userId === userId ? fetched : null;
  return {
    items: userId ? (current?.items ?? null) : null,
    loading: Boolean(userId) && current === null,
    error: current?.error ?? null,
    refresh,
  };
}
