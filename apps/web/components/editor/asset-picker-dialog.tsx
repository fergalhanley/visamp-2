"use client";

import { useMemo, useState } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/components/auth/auth-provider";
import { formatBytes, useAssetLibrary, type LibraryAsset } from "@/hooks/use-asset-library";
import { assetReference } from "@/lib/assets/upload";
import { cn } from "@/lib/utils";

interface AssetPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Receives the DSL reference to drop into the script. */
  onPick: (reference: string) => void;
}

/**
 * Picks an asset and hands back the reference to paste.
 *
 * Deliberately inserts `asset::bitmap("…")` rather than a whole draw call: the
 * author decides what to do with it, and the reference is the part that is
 * tedious and error-prone to type by hand.
 */
export function AssetPickerDialog({ open, onOpenChange, onPick }: AssetPickerDialogProps) {
  const { user } = useAuth();
  const { mine, shared, loading, error } = useAssetLibrary(user?.id ?? null);
  const [filter, setFilter] = useState("");

  const usable = useMemo(() => {
    const all = [...mine, ...shared].filter(
      (asset) => asset.status === "ready" && !asset.withdrawnAt,
    );
    const needle = filter.trim().toLowerCase();
    return needle
      ? all.filter((asset) => asset.fileName.toLowerCase().includes(needle))
      : all;
  }, [mine, shared, filter]);

  function pick(asset: LibraryAsset) {
    onPick(assetReference(asset.kind, asset.id));
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Insert an asset</DialogTitle>
          <DialogDescription>
            Adds a reference at the cursor. Your own assets and everything shared
            publicly.
          </DialogDescription>
        </DialogHeader>

        {!user && <p>Log in to use your own assets.</p>}
        {error && <p role="alert">{error}</p>}
        {loading && <p>Loading…</p>}

        {!loading && (
          <>
            <input
              type="search"
              placeholder="Filter by file name"
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              className="w-full rounded border border-white/15 bg-transparent px-2 py-1 text-sm"
            />

            {usable.length === 0 && (
              <p className="text-sm opacity-75">
                Nothing to insert yet. Upload something on the{" "}
                <a href="/assets" className="underline">
                  assets page
                </a>
                .
              </p>
            )}

            <ul className="max-h-80 space-y-1 overflow-y-auto">
              {usable.map((asset) => (
                <li key={asset.id}>
                  <button
                    type="button"
                    onClick={() => pick(asset)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded p-2 text-left",
                      "hover:bg-white/10",
                    )}
                  >
                    <span className="asset-preview h-10 w-10 shrink-0">
                      {asset.previewUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element -- signed, short-lived URL from private storage
                        <img src={asset.previewUrl} alt="" />
                      ) : (
                        <span aria-hidden className="text-[10px]">
                          {asset.kind === "model" ? "3D" : "—"}
                        </span>
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">{asset.fileName}</span>
                      <span className="block text-xs opacity-70">
                        {asset.kind} · {formatBytes(asset.bytes)}
                        {asset.mine ? "" : " · shared"}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
