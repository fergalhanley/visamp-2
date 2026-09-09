"use client";

import { useState, type ChangeEvent } from "react";

import { AssetCard } from "@/components/assets/asset-card";
import { useAuth } from "@/components/auth/auth-provider";
import {
  ASSET_BYTE_QUOTA,
  ASSET_COUNT_QUOTA,
  formatBytes,
  useAssetLibrary,
} from "@/hooks/use-asset-library";
import { ACCEPTED_EXTENSIONS, AssetRejected } from "@/lib/assets/rules";
import { createClient } from "@/lib/supabase/client";
import { deleteAsset, setAssetVisibility, uploadAsset } from "@/lib/assets/upload";

const ACCEPT = ACCEPTED_EXTENSIONS.map((extension) => `.${extension}`).join(",");

/**
 * Asset management inside the editor, as a sibling tab to the script.
 *
 * The same cards as the standalone library page rather than a reduced picker:
 * uploading, publishing and removing an asset are all things you want to do
 * while writing the script that uses it, and sending someone to another page
 * mid-edit to do them is the friction this replaces.
 */
export function AssetPanel({ onInsert }: { onInsert: (reference: string) => void }) {
  const { user } = useAuth();
  const { mine, shared, error, loading, refresh, usedBytes, usedCount } =
    useAssetLibrary(user?.id ?? null);
  const [stage, setStage] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setBusy(true);
    setProblem(null);
    try {
      await uploadAsset(createClient(), file, setStage);
      setStage("Uploaded.");
      await refresh();
    } catch (cause) {
      setStage(null);
      setProblem(
        cause instanceof AssetRejected
          ? cause.message
          : "Something went wrong uploading that file.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function act(action: () => Promise<unknown>) {
    setProblem(null);
    try {
      await action();
      await refresh();
    } catch (cause) {
      setProblem(
        cause instanceof AssetRejected ? cause.message : "That did not work.",
      );
    }
  }

  if (!user)
    return (
      <div className="h-full overflow-y-auto p-4 text-sm">
        <p className="text-muted-foreground">
          Log in to upload assets and use them in this visual.
        </p>
      </div>
    );

  const full = usedCount >= ASSET_COUNT_QUOTA || usedBytes >= ASSET_BYTE_QUOTA;

  return (
    <div className="h-full overflow-y-auto p-4 text-sm">
      <label className="block">
        <span className="mb-1 block text-xs text-muted-foreground">
          Add an image, vector or model — private until you share it
        </span>
        <input
          type="file"
          accept={ACCEPT}
          onChange={onFile}
          disabled={busy || full}
          className="w-full text-xs"
        />
      </label>

      {full && (
        <p role="status" className="mt-2 text-xs text-amber-400">
          Library full — {ASSET_COUNT_QUOTA} assets or {formatBytes(ASSET_BYTE_QUOTA)}.
        </p>
      )}
      {stage && !problem && (
        <p role="status" className="mt-2 text-xs text-muted-foreground">
          {stage}
        </p>
      )}
      {problem && (
        <p role="alert" className="mt-2 text-xs text-destructive">
          {problem}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-2 text-xs text-destructive">
          {error}
        </p>
      )}

      <p className="mt-2 text-xs text-muted-foreground">
        {usedCount} of {ASSET_COUNT_QUOTA} assets · {formatBytes(usedBytes)} of{" "}
        {formatBytes(ASSET_BYTE_QUOTA)} ·{" "}
        <a href="/assets" className="underline">
          full library
        </a>
      </p>

      {loading && <p className="mt-4 text-xs text-muted-foreground">Loading…</p>}

      {!loading && mine.length === 0 && (
        <p className="mt-4 text-xs text-muted-foreground">
          Nothing yet. Upload something above, then insert it into the script.
        </p>
      )}

      <div className="asset-grid">
        {mine.map((asset) => (
          <AssetCard
            key={asset.id}
            asset={asset}
            onInsert={onInsert}
            onPublish={() =>
              act(() =>
                setAssetVisibility(
                  asset.id,
                  asset.visibility === "public" ? "private" : "public",
                ),
              )
            }
            onDelete={() => act(() => deleteAsset(asset.id))}
          />
        ))}
      </div>

      {shared.length > 0 && (
        <>
          <h3 className="mt-4 text-xs uppercase tracking-wide text-muted-foreground">
            Shared by others
          </h3>
          <div className="asset-grid">
            {shared.map((asset) => (
              <AssetCard key={asset.id} asset={asset} onInsert={onInsert} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
