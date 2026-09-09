"use client";

import { useState, type ChangeEvent } from "react";

import { AccountMenu } from "@/components/auth/account-menu";
import { useAuth } from "@/components/auth/auth-provider";
import {
  ASSET_BYTE_QUOTA,
  ASSET_COUNT_QUOTA,
  formatBytes,
  limitFor,
  useAssetLibrary,
  type LibraryAsset,
} from "@/hooks/use-asset-library";
import { ACCEPTED_EXTENSIONS, AssetRejected } from "@/lib/assets/rules";
import { createClient } from "@/lib/supabase/client";
import {
  assetReference,
  deleteAsset,
  setAssetVisibility,
  uploadAsset,
} from "@/lib/assets/upload";

const ACCEPT = ACCEPTED_EXTENSIONS.map((extension) => `.${extension}`).join(",");

export function AssetLibrary() {
  const { user, loading } = useAuth();
  if (loading) return <p className="mt-8">Checking your account…</p>;
  if (!user)
    return (
      <div className="site-form">
        <h2>Bring your own images and models.</h2>
        <p>Log in to upload assets and use them in your visuals.</p>
        <AccountMenu />
      </div>
    );
  return <Library key={user.id} userId={user.id} />;
}

function Library({ userId }: { userId: string }) {
  const { mine, shared, error, loading, refresh, usedBytes, usedCount } =
    useAssetLibrary(userId);
  const [stage, setStage] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Clear immediately so choosing the same file again still fires a change.
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
        cause instanceof AssetRejected
          ? cause.message
          : "That did not work. Please try again.",
      );
    }
  }

  const full = usedCount >= ASSET_COUNT_QUOTA || usedBytes >= ASSET_BYTE_QUOTA;

  return (
    <>
      <section className="site-form">
        <h2>Add an asset</h2>
        <p>
          Images and models you upload are <strong>private</strong> until you
          choose to share them. Accepted: PNG, JPEG and WebP up to{" "}
          {limitFor("bitmap")}, SVG up to {limitFor("vector")}, and GLB models up
          to {limitFor("model")}.
        </p>

        <label className="check-label" htmlFor="asset-file">
          <input
            id="asset-file"
            type="file"
            accept={ACCEPT}
            onChange={onFile}
            disabled={busy || full}
          />
        </label>

        {full && (
          <p role="status">
            Your library is full. Delete something to make room — the limit is{" "}
            {ASSET_COUNT_QUOTA} assets and {formatBytes(ASSET_BYTE_QUOTA)}.
          </p>
        )}
        {stage && !problem && <p role="status">{stage}</p>}
        {problem && (
          <p role="alert" className="site-badge">
            {problem}
          </p>
        )}
        <small>
          Using {usedCount} of {ASSET_COUNT_QUOTA} assets, {formatBytes(usedBytes)}{" "}
          of {formatBytes(ASSET_BYTE_QUOTA)}.
        </small>
      </section>

      {error && <p role="alert">{error}</p>}

      <section>
        <h2>Your assets</h2>
        {loading && <p>Loading…</p>}
        {!loading && mine.length === 0 && (
          <p>Nothing here yet. Upload something above to use it in a visual.</p>
        )}
        <div className="asset-grid">
          {mine.map((asset) => (
            <AssetCard
              key={asset.id}
              asset={asset}
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
      </section>

      <section>
        <h2>Shared by others</h2>
        <p>
          Assets other people have made public. Anyone can use these, including
          in exported video.
        </p>
        {shared.length === 0 && <p>Nothing has been shared yet.</p>}
        <div className="asset-grid">
          {shared.map((asset) => (
            <AssetCard key={asset.id} asset={asset} />
          ))}
        </div>
      </section>
    </>
  );
}

function AssetCard({
  asset,
  onPublish,
  onDelete,
}: {
  asset: LibraryAsset;
  onPublish?: () => void;
  onDelete?: () => void;
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
