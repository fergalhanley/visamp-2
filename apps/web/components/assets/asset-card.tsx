"use client";

import { useState } from "react";

import { formatBytes, type LibraryAsset } from "@/hooks/use-asset-library";
import { assetReference } from "@/lib/assets/upload";

export function AssetCard({
  asset,
  onPublish,
  onDelete,
  onInsert,
}: {
  asset: LibraryAsset;
  onPublish?: () => void;
  onDelete?: () => void;
  /** Offered by the editor panel, which can put the reference into the script. */
  onInsert?: (reference: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  const reference = assetReference(asset.kind, asset.id);

  // Deleting is only ever offered for an asset that has never been public;
  // anything published goes out of service through an admin withdrawal so the
  // visuals using it can be found and warned.
  const deletable = onDelete && !asset.publishedAt && asset.status !== "uploading";

  return (
    <article className="asset-card">
      <div className="asset-preview">
        {asset.previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- signed, short-lived URL from private storage
          <img src={asset.previewUrl} alt="" loading="lazy" />
        ) : (
          <span aria-hidden>{asset.kind === "model" ? "3D" : "—"}</span>
        )}
      </div>

      <h3 title={asset.fileName}>{asset.fileName}</h3>
      <p className="asset-meta">
        {asset.kind} · {formatBytes(asset.bytes)}
        {asset.mine && asset.visibility === "public" && " · public"}
        {asset.mine && asset.publishedAt && asset.visibility === "private" && " · unlisted"}
      </p>

      {asset.status === "failed" && (
        <p role="alert" className="asset-meta">
          Rejected: {asset.error ?? "this file could not be used."}
        </p>
      )}
      {asset.status === "uploading" && <p className="asset-meta">Still uploading…</p>}
      {asset.withdrawnAt && <p className="asset-meta">Removed by an administrator.</p>}

      {onInsert && asset.status === "ready" && !asset.withdrawnAt && (
        <button
          type="button"
          className="site-button"
          onClick={() => onInsert(reference)}
        >
          Insert
        </button>
      )}

      {asset.status === "ready" && !asset.withdrawnAt && (
        <button
          type="button"
          className="site-button"
          onClick={() => {
            void navigator.clipboard?.writeText(reference);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? "Copied" : "Copy reference"}
        </button>
      )}

      {onPublish && asset.status === "ready" && !asset.withdrawnAt && (
        <button type="button" className="site-button" onClick={onPublish}>
          {asset.visibility === "public" ? "Make private" : "Make public"}
        </button>
      )}

      {deletable && (
        <button type="button" className="site-button" onClick={onDelete}>
          Delete
        </button>
      )}

      {asset.mine && asset.publishedAt && asset.visibility === "private" && (
        <small>
          Already-published copies keep working; this only stops new use.
        </small>
      )}
    </article>
  );
}
