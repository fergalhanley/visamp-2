"use client";

import { Check, ListPlus, Loader2, Plus } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { useAuth } from "@/components/auth/auth-provider";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";
import type { Visualisation } from "@/lib/types";

interface Playlist {
  id: string;
  title: string;
  contains: boolean;
}

interface AddToPlaylistDialogProps {
  vis: Visualisation;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AddToPlaylistDialog({
  vis,
  open,
  onOpenChange,
}: AddToPlaylistDialogProps) {
  const { user } = useAuth();
  const [playlists, setPlaylists] = useState<Playlist[] | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  /** Pure fetch — callers own the state, so this stays usable from effects. */
  const fetchPlaylists = useCallback(async (): Promise<{
    items: Playlist[];
    error: string | null;
  }> => {
    if (!user) return { items: [], error: null };

    const supabase = createClient();
    const [{ data: rows, error: listError }, { data: members }] = await Promise.all([
      supabase
        .from("playlists")
        .select("id, title")
        .eq("owner_id", user.id)
        .order("created_at", { ascending: false }),
      supabase.from("playlist_items").select("playlist_id").eq("vis_id", vis.id),
    ]);

    if (listError) return { items: [], error: listError.message };

    const memberOf = new Set((members ?? []).map((m) => m.playlist_id));
    return {
      items: (rows ?? []).map((row) => ({
        id: row.id,
        title: row.title,
        contains: memberOf.has(row.id),
      })),
      error: null,
    };
  }, [user, vis.id]);

  const reload = useCallback(async () => {
    const { items, error: loadError } = await fetchPlaylists();
    setPlaylists(items);
    setError(loadError);
  }, [fetchPlaylists]);

  useEffect(() => {
    if (!open) return;

    let active = true;
    void fetchPlaylists().then(({ items, error: loadError }) => {
      if (!active) return;
      setPlaylists(items);
      setError(loadError);
    });

    return () => {
      active = false;
    };
  }, [open, fetchPlaylists]);

  const add = async (playlistId: string) => {
    setBusy(playlistId);
    setError(null);

    const supabase = createClient();

    // Append: take the current tail position rather than assuming a length.
    const { data: last } = await supabase
      .from("playlist_items")
      .select("position")
      .eq("playlist_id", playlistId)
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { error: insertError } = await supabase.from("playlist_items").insert({
      playlist_id: playlistId,
      vis_id: vis.id,
      position: (last?.position ?? -1) + 1,
    });

    if (insertError) setError(insertError.message);
    else await reload();

    setBusy(null);
  };

  const createAndAdd = async () => {
    const title = newTitle.trim();
    if (!user || !title) return;

    setBusy("new");
    setError(null);

    const { data, error: createError } = await createClient()
      .from("playlists")
      .insert({ owner_id: user.id, title })
      .select("id")
      .single();

    if (createError || !data) {
      setError(createError?.message ?? "Could not create playlist");
      setBusy(null);
      return;
    }

    setNewTitle("");
    setBusy(null);
    await add(data.id);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Add to playlist</DialogTitle>
          <DialogDescription className="truncate">{vis.title}</DialogDescription>
        </DialogHeader>

        {playlists === null ? (
          <p className="text-xs text-muted-foreground">Loading…</p>
        ) : playlists.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No playlists yet. Create one below.
          </p>
        ) : (
          <ul className="max-h-56 space-y-1 overflow-y-auto">
            {playlists.map((playlist) => (
              <li key={playlist.id}>
                <button
                  type="button"
                  disabled={playlist.contains || busy !== null}
                  onClick={() => void add(playlist.id)}
                  className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-sm transition hover:bg-foreground/5 disabled:opacity-60"
                >
                  <span className="truncate">{playlist.title}</span>
                  {busy === playlist.id ? (
                    <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
                  ) : playlist.contains ? (
                    <Check className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  ) : (
                    <ListPlus className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}

        <form
          onSubmit={(event) => {
            event.preventDefault();
            void createAndAdd();
          }}
          className="flex gap-2 border-t pt-3"
        >
          <Input
            value={newTitle}
            onChange={(event) => setNewTitle(event.target.value)}
            placeholder="New playlist"
            aria-label="New playlist title"
          />
          <Button type="submit" size="sm" disabled={!newTitle.trim() || busy !== null}>
            <Plus className="h-3.5 w-3.5" />
            Create
          </Button>
        </form>

        {error && <p className="text-xs text-destructive">{error}</p>}
      </DialogContent>
    </Dialog>
  );
}
