"use client";

import { useCallback, useEffect, useState } from "react";

import { createClient } from "@/lib/supabase/client";
import { ASSET_BUCKET } from "@/lib/assets/upload";
import { ASSET_BYTE_LIMITS, type AssetKind } from "@/lib/assets/rules";

export const ASSET_COUNT_QUOTA = 300;
export const ASSET_BYTE_QUOTA = 1024 * 1024 * 1024;

export interface LibraryAsset {
  id: string;
  kind: AssetKind;
  fileName: string;
  bytes: number;
  status: string;
  error: string | null;
  visibility: "public" | "private";
  publishedAt: string | null;
  withdrawnAt: string | null;
  createdAt: string;
  /** Short-lived URL for a preview, when the kind has one. */
  previewUrl: string | null;
  mine: boolean;
}

interface Row {
  id: string;
  kind: AssetKind;
  file_name: string;
  bytes: number;
  status: string;
  error: string | null;
  visibility: "public" | "private";
  published_at: string | null;
  withdrawn_at: string | null;
  created_at: string;
  object_key: string;
  owner_id: string | null;
}

/**
 * The viewer's own assets, plus what everyone else has made public.
 *
 * Read straight from PostgREST rather than through a route: the policies decide
 * what comes back, so the query and the access rule are the same thing. The
 * public list filters `visibility` explicitly — the read policy deliberately
 * keeps unpublished-but-once-public assets readable so existing work keeps
 * rendering, and those have no business being offered for new use.
 */
export function useAssetLibrary(userId: string | null) {
  const [mine, setMine] = useState<LibraryAsset[]>([]);
  const [shared, setShared] = useState<LibraryAsset[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    if (!userId) return;
    const supabase = createClient();
    const columns =
      "id,kind,file_name,bytes,status,error,visibility,published_at,withdrawn_at,created_at,object_key,owner_id";

    const [own, published] = await Promise.all([
      supabase
        .from("assets")
        .select(columns)
        .eq("owner_id", userId)
        .order("created_at", { ascending: false })
        .limit(ASSET_COUNT_QUOTA),
      supabase
        .from("assets")
        .select(columns)
        .eq("visibility", "public")
        .eq("status", "ready")
        .is("withdrawn_at", null)
        .neq("owner_id", userId)
        .order("created_at", { ascending: false })
        .limit(200),
    ]);

    if (own.error || published.error) {
      setError(own.error?.message ?? published.error?.message ?? "Could not load your assets.");
      setLoaded(true);
      return;
    }

    setMine(await decorate(supabase, (own.data ?? []) as Row[], true));
    setShared(await decorate(supabase, (published.data ?? []) as Row[], false));
    setError(null);
    setLoaded(true);
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    let active = true;
    // Every state update here happens after the network request settles.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh().catch(() => {
      if (active) setError("Could not load your assets.");
    });
    return () => {
      active = false;
    };
  }, [userId, refresh]);

  const usedBytes = mine
    .filter((asset) => asset.status !== "failed")
    .reduce((total, asset) => total + asset.bytes, 0);

  return {
    mine,
    shared,
    error,
    loading: Boolean(userId) && !loaded,
    refresh,
    usedBytes,
    usedCount: mine.filter((asset) => asset.status !== "failed").length,
  };
}

async function decorate(
  supabase: ReturnType<typeof createClient>,
  rows: Row[],
  mine: boolean,
): Promise<LibraryAsset[]> {
  // Signed URLs only for what can actually be shown, and only for assets that
  // finished admission — an object for an unfinished upload may not exist.
  const previewable = rows.filter(
    (row) => row.kind !== "model" && row.status === "ready" && !row.withdrawn_at,
  );
  const signed = new Map<string, string>();

  if (previewable.length > 0) {
    const { data } = await supabase.storage
      .from(ASSET_BUCKET)
      .createSignedUrls(previewable.map((row) => row.object_key), 60 * 30);
    for (const entry of data ?? []) {
      if (entry.signedUrl && entry.path) signed.set(entry.path, entry.signedUrl);
    }
  }

  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    fileName: row.file_name,
    bytes: row.bytes,
    status: row.status,
    error: row.error,
    visibility: row.visibility,
    publishedAt: row.published_at,
    withdrawnAt: row.withdrawn_at,
    createdAt: row.created_at,
    previewUrl: signed.get(row.object_key) ?? null,
    mine,
  }));
}

export function formatBytes(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

export function limitFor(kind: AssetKind) {
  return formatBytes(ASSET_BYTE_LIMITS[kind]);
}
