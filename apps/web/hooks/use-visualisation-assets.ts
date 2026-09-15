"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ResolvedAsset } from "@visamp/player";
import { useAuth } from "@/components/auth/auth-provider";
import { resolveSourceAssets } from "@/lib/assets/client";
import { createClient } from "@/lib/supabase/client";
import { extractAssetReferences } from "@/lib/assets/references";

/** Prepare a complete asset set for one selection and the current viewer. */
export function useVisualisationAssets(source: string, selectionKey = "") {
  const { user, loading: authLoading } = useAuth();
  const scope = user?.id ?? "anonymous";
  const references = extractAssetReferences(source).sort().join(",");
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  // Identity, rather than a reusable string, makes A → B → A revalidate even
  // when B is still loading and the last completed result belongs to A.
  const key = useMemo(
    () => ({ references, selectionKey, scope, authLoading, attempt }),
    [references, selectionKey, scope, authLoading, attempt],
  );
  const [resolved, setResolved] = useState<{
    key: typeof key;
    assets: ResolvedAsset[];
    missing: string[];
  } | null>(null);

  useEffect(() => {
    if (!references || authLoading) return;
    let current = true;
    void resolveSourceAssets(createClient(), source).then(
      (result) => {
        if (current) setResolved({ key, ...result });
      },
      () => {
        if (current)
          setResolved({ key, assets: [], missing: references.split(",") });
      },
    );
    return () => {
      current = false;
    };
    // Only changing references/selection/viewer/retry requires preparation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const current = resolved?.key === key;
  const missing = current ? resolved.missing : EMPTY_IDS;
  const status = !references
    ? "ready"
    : !current
      ? "loading"
      : missing.length
        ? "error"
        : "ready";
  return {
    assets: references && current ? resolved.assets : EMPTY_ASSETS,
    preparation: { status, missing, retry, scope } as const,
  };
}
const EMPTY_ASSETS: ResolvedAsset[] = [];
const EMPTY_IDS: string[] = [];
