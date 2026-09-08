"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { AccountMenu } from "@/components/auth/account-menu";
type Track = {
  id: string;
  title: string;
  status: string;
  play_count: number;
  album: string | null;
};
type Overview = {
  stats: {
    users: number;
    visualisations: number;
    tracks: number;
    pending: number;
  };
  tracks: Track[];
  uploads: {
    id: string;
    title: string;
    status: string;
    error: string | null;
  }[];
  hasMore: boolean;
};
export function Dashboard() {
  const { user, loading } = useAuth();
  if (loading) return <p>Checking your account…</p>;
  if (!user)
    return (
      <div className="site-form">
        <p>Log in with a site administrator account to continue.</p>
        <AccountMenu />
      </div>
    );
  return <AdminOverview key={user.id} />;
}
function AdminOverview() {
  const [data, setData] = useState<Overview | null>(null);
  const [page, setPage] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<Track | null>(null);
  const [preview, setPreview] = useState<{ title: string; url: string } | null>(
    null,
  );
  const refresh = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const response = await fetch("/api/admin/overview?page=" + page, {
          signal,
          cache: "no-store",
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error);
        setData(result);
        setError(null);
      } catch (cause) {
        if (!signal?.aborted)
          setError(
            cause instanceof Error
              ? cause.message
              : "Could not load dashboard.",
          );
      }
    },
    [page],
  );
  useEffect(() => {
    const controller = new AbortController();
    void refresh(controller.signal);
    return () => controller.abort();
  }, [refresh]);
  async function action(
    track: Track,
    action: "publish" | "withdraw" | "preview",
  ) {
    if (
      action === "withdraw" &&
      !window.confirm(
        "Withdraw “" +
          track.title +
          "”? It will stop being available and its playback files will be removed. The master is retained.",
      )
    )
      return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(
        "/api/admin/tracks/" +
          track.id +
          "/" +
          (action === "preview" ? "playback" : action),
        { method: action === "preview" ? "GET" : "POST" },
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      if (action === "preview") {
        const source =
          result.sources?.find(
            (source: { format: string }) => source.format === "aac",
          ) ?? result.sources?.[0];
        if (!source) throw new Error("No playback rendition is available yet.");
        setPreview({ title: track.title, url: source.url });
      } else {
        setPreview(null);
        await refresh();
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Action failed.");
    } finally {
      setBusy(false);
    }
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) return;
    const fields = new FormData(event.currentTarget);
    setBusy(true);
    try {
      const response = await fetch("/api/admin/tracks/" + editing.id, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: fields.get("title"),
          album: fields.get("album") || null,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setEditing(null);
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }
  if (!data)
    return (
      <div className="site-form">
        <p role="status">{error ?? "Loading dashboard…"}</p>
        {error && (
          <button
            className="site-button secondary"
            onClick={() => void refresh()}
          >
            Try again
          </button>
        )}
      </div>
    );
  return (
    <>
      <div className="stats-grid">
        {Object.entries(data.stats).map(([label, count]) => (
          <div className="stat-card" key={label}>
            <strong>{count.toLocaleString()}</strong>
            <span>
              {label === "pending"
                ? "Uploads awaiting processing"
                : label === "users"
                  ? "User accounts"
                  : label === "tracks"
                    ? "Audio tracks"
                    : "Visualisations"}
            </span>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap justify-between gap-4">
        <h2>Audio catalogue</h2>
        <div className="flex gap-3">
          <button
            className="site-button secondary"
            onClick={() => void refresh()}
            disabled={busy}
          >
            Refresh
          </button>
          <a className="site-button primary" href="/upload">
            Upload music
          </a>
        </div>
      </div>
      {error && (
        <p role="alert" className="site-message mt-4">
          {error}
        </p>
      )}
      {preview && (
        <div className="site-form">
          <p>Preview: {preview.title}</p>
          <audio
            key={preview.url}
            src={preview.url}
            controls
            preload="none"
            className="w-full"
            aria-label={"Preview " + preview.title}
          />
          <button
            onClick={() => setPreview(null)}
            className="site-button secondary"
          >
            Close preview
          </button>
        </div>
      )}
      {editing && (
        <form onSubmit={save} className="site-form">
          <h2>Edit track</h2>
          <label>
            Title
            <input
              name="title"
              defaultValue={editing.title}
              required
              maxLength={200}
            />
          </label>
          <label>
            Album
            <input
              name="album"
              defaultValue={editing.album ?? ""}
              maxLength={200}
            />
          </label>
          <div className="flex gap-3">
            <button disabled={busy} className="site-button primary">
              Save changes
            </button>
            <button
              type="button"
              onClick={() => setEditing(null)}
              className="site-button secondary"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
      <div className="site-table-wrap">
        <table className="site-table">
          <thead>
            <tr>
              <th>Track</th>
              <th>Status</th>
              <th>Plays</th>
              <th>Manage</th>
            </tr>
          </thead>
          <tbody>
            {data.tracks.map((track) => (
              <tr key={track.id}>
                <td>
                  {track.title}
                  <span className="block text-xs text-muted-foreground">
                    {track.album}
                  </span>
                </td>
                <td>{track.status}</td>
                <td>{track.play_count.toLocaleString()}</td>
                <td>
                  <div className="flex flex-wrap gap-2">
                    {track.status !== "withdrawn" && (
                      <button disabled={busy} onClick={() => setEditing(track)}>
                        Edit
                      </button>
                    )}
                    {["draft", "live"].includes(track.status) && (
                      <button
                        disabled={busy}
                        onClick={() => void action(track, "preview")}
                      >
                        Preview
                      </button>
                    )}
                    {track.status === "draft" && (
                      <button
                        disabled={busy}
                        onClick={() => void action(track, "publish")}
                      >
                        Publish
                      </button>
                    )}
                    {["draft", "live"].includes(track.status) && (
                      <button
                        disabled={busy}
                        onClick={() => void action(track, "withdraw")}
                      >
                        Withdraw
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!data.tracks.length && (
          <p className="py-8 text-sm text-muted-foreground">
            No tracks yet. Upload a licensed recording to get started.
          </p>
        )}
      </div>
      <div className="flex justify-between">
        <button
          className="site-button secondary"
          disabled={!page || busy}
          onClick={() => {
            setData(null);
            setPage(page - 1);
          }}
        >
          Previous
        </button>
        <span className="text-sm text-muted-foreground">Page {page + 1}</span>
        <button
          className="site-button secondary"
          disabled={!data.hasMore || busy}
          onClick={() => {
            setData(null);
            setPage(page + 1);
          }}
        >
          Next
        </button>
      </div>
      <section className="mt-14">
        <h2>Recent upload activity</h2>
        <div className="site-table-wrap">
          <table className="site-table">
            <thead>
              <tr>
                <th>Track</th>
                <th>Status</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {data.uploads.map((upload) => (
                <tr key={upload.id}>
                  <td>{upload.title}</td>
                  <td>{upload.status}</td>
                  <td>{upload.error ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!data.uploads.length && (
            <p className="py-6 text-sm text-muted-foreground">
              No submissions yet.
            </p>
          )}
        </div>
      </section>
      <section className="site-form">
        <h2>More tools, coming soon.</h2>
        <p className="text-sm text-muted-foreground">
          Artist onboarding, licence management and deeper analytics will live
          here.
        </p>
      </section>
    </>
  );
}
