"use client";

import { useEffect, useState } from "react";
import type { ResolvedAsset } from "@visamp/player";

import { resolveSourceAssets } from "@/lib/assets/client";
import { createClient } from "@/lib/supabase/client";
import { extractAssetReferences } from "@/lib/assets/references";

/**
 * Resolves the assets a script cites, for the viewer currently signed in.
 *
 * Keyed on the set of referenced ids rather than the source text, so editing
 * around a reference does not re-download anything. Every fetch is guarded
 * against arriving after a later one: an out-of-order response would otherwise
 * show a previous visual's assets.
 */
export function useVisualisationAssets(source: string) {
  const references = extractAssetReferences(source).sort().join(",");
  const [resolved, setResolved] = useState<{
    references: string;
    assets: ResolvedAsset[];
    missing: string[];
  }>({ references: "", assets: [], missing: [] });

  useEffect(() => {
    if (!references) return;

    let current = true;
    void resolveSourceAssets(createClient(), source)
      .then((resolution) => {
        if (!current) return;
        setResolved({ references, ...resolution });
      })
      .catch(() => {
        if (!current) return;
        // A failed resolve renders untextured rather than blank; VIS-55 owns
        // telling the author which references are broken.
        setResolved({ references, assets: [], missing: references.split(",") });
      });

    return () => {
      current = false;
    };
    // `source` is deliberately not a dependency: only the referenced ids matter,
    // and they are what `references` captures.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [references]);

  // Results from a previous set of references must not be handed to the engine
  // while the new ones are still in flight.
  const current = resolved.references === references;
  return {
    assets: current ? resolved.assets : EMPTY_ASSETS,
    missing: current ? resolved.missing : EMPTY_IDS,
  };
}

// Stable identities, so an unchanged result does not re-run the upload effect.
const EMPTY_ASSETS: ResolvedAsset[] = [];
const EMPTY_IDS: string[] = [];
