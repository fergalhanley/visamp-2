"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import type { ResolvedAsset } from "@visamp/player";
import { extractAssetReferences } from "@/lib/assets/references";
import { resolveSourceAssets } from "@/lib/assets/client";
import { createEmbedClient } from "@/lib/embed/public-client";

const EMPTY: ResolvedAsset[] = [];
export function useEmbedAssets(source: string, selection: string) {
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  const key = useMemo(
    () => ({ source, selection, attempt }),
    [source, selection, attempt],
  );
  const references = useMemo(() => extractAssetReferences(source), [source]);
  const [resolved, setResolved] = useState<{
    key: typeof key;
    assets: ResolvedAsset[];
    missing: string[];
  } | null>(null);
  useEffect(() => {
    if (!references.length) return;
    let current = true;
    // Construct lazily: bundled examples work with no Supabase configuration.
    void Promise.resolve()
      .then(() => resolveSourceAssets(createEmbedClient(), source))
      .then(
        (result) => {
          if (current) setResolved({ key, ...result });
        },
        () => {
          if (current) setResolved({ key, assets: [], missing: references });
        },
      );
    return () => {
      current = false;
    };
  }, [key, references, source]);
  const current = resolved?.key === key;
  const missing = current ? resolved.missing : [];
  return {
    assets: current ? resolved.assets : EMPTY,
    preparation: {
      status: !references.length
        ? ("ready" as const)
        : !current
          ? ("loading" as const)
          : missing.length
            ? ("error" as const)
            : ("ready" as const),
      missing,
      retry,
      scope: "embed-anonymous",
    },
  };
}
