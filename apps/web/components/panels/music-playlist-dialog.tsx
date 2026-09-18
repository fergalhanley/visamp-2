"use client";
import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { musicRequest, collectionChanged } from "@/lib/music/client";
import type { HostedTrackSummary } from "@/lib/hosted-audio/types";

export function MusicPlaylistDialog({
  track,
  close,
}: {
  track: HostedTrackSummary;
  close: () => void;
}) {
  const [playlists, setPlaylists] = useState<
    { id: string; title: string; contains: boolean }[]
  >([]);
  const [title, setTitle] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    musicRequest<{ playlists: typeof playlists }>(
      `/api/music/collections?track=${track.id}`,
    )
      .then((data) => {
        if (active) setPlaylists(data.playlists);
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [track.id]);
  async function add(id?: string) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      let playlistId = id;
      if (!playlistId) {
        const { playlist } = await musicRequest<{
          playlist: { id: string; title: string };
        }>("/api/music/collections", { action: "create", title });
        playlistId = playlist.id;
        setPlaylists((items) => [{ ...playlist, contains: false }, ...items]);
        setTitle("");
        collectionChanged();
      }
      await musicRequest("/api/music/collections", {
        action: "add",
        playlistId,
        trackId: track.id,
      });
      collectionChanged();
      close();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add track.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <DialogContent className="w-[calc(100vw-2rem)] sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Add to music playlist</DialogTitle>
          <DialogDescription>{track.title}</DialogDescription>
        </DialogHeader>
        {loading ? (
          <p>Loading…</p>
        ) : (
          <ul className="max-h-60 overflow-y-auto">
            {playlists.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  disabled={busy || p.contains}
                  onClick={() => void add(p.id)}
                  className="w-full rounded px-2 py-2 text-left text-sm hover:bg-foreground/10 disabled:opacity-50"
                >
                  {p.title}
                  {p.contains ? " · Added" : ""}
                </button>
              </li>
            ))}
          </ul>
        )}
        {!loading && !playlists.length && (
          <p className="text-sm text-muted-foreground">
            Create your first music playlist below.
          </p>
        )}
        <form
          className="flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void add();
          }}
        >
          <input
            aria-label="New music playlist name"
            maxLength={80}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="New playlist"
            className="min-w-0 flex-1 rounded border bg-transparent p-2 text-sm"
          />
          <button
            type="submit"
            disabled={busy || !title.trim()}
            className="rounded border px-3 py-2 text-sm disabled:opacity-50"
          >
            Create & add
          </button>
        </form>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
