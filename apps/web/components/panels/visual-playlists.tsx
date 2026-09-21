"use client";
import { track } from "@/lib/analytics/client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { creatorFromProfile, visualisationFromRow } from "@/lib/visualisations";
import type { Visualisation } from "@/lib/types";
import { useSessionStore } from "@/lib/store/session";
import { VisTile } from "./tiles";
import { VirtualList } from "./virtual-list";

export function VisualPlaylists({
  userId,
  query,
  renderItem,
  onSelect,
  activeId,
}: {
  userId: string;
  query: string;
  onSelect?: (vis: Visualisation) => void;
  activeId?: string;
  renderItem?: (vis: Visualisation) => React.ReactNode;
}) {
  const [playlists, setPlaylists] = useState<{ id: string; title: string }[]>(
    [],
  );
  const [selected, setSelected] = useState<{
    id: string;
    title: string;
  } | null>(null);
  const [items, setItems] = useState<Visualisation[]>([]);
  const [loaded, setLoaded] = useState("");
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const loadKey = `${selected?.id ?? "list"}|${version}`;
  const loading = loaded !== loadKey;
  const currentId = useSessionStore((s) => s.current.id);
  useEffect(() => {
    let active = true;
    const db = createClient();
    async function load() {
      if (selected) {
        const result: Visualisation[] = [];
        for (let offset = 0; ; offset += 200) {
          const { data, error } = await db
            .from("playlist_items")
            .select(
              "visualisations!playlist_items_vis_id_fkey(*,profiles!visualisations_owner_id_fkey(*))",
            )
            .eq("playlist_id", selected.id)
            .order("position")
            .order("vis_id")
            .range(offset, offset + 199);
          if (error) throw error;
          if (!active) return;
          result.push(
            ...(data ?? []).flatMap((item) =>
              item.visualisations
                ? [
                    visualisationFromRow(
                      item.visualisations,
                      creatorFromProfile(item.visualisations.profiles),
                    ),
                  ]
                : [],
            ),
          );
          if (!data || data.length < 200) break;
        }
        if (active) setItems(result);
      } else {
        const { data, error } = await db
          .from("playlists")
          .select("id,title")
          .eq("owner_id", userId)
          .order("created_at", { ascending: false })
          .limit(200);
        if (error) throw error;
        if (active) setPlaylists(data ?? []);
      }
    }
    void load()
      .then(() => {
        if (active) setError("");
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoaded(loadKey);
      });
    return () => {
      active = false;
    };
  }, [userId, selected, version, loadKey]);
  useEffect(() => {
    const changed = () => setVersion((v) => v + 1);
    window.addEventListener("visamp:playlists-changed", changed);
    return () =>
      window.removeEventListener("visamp:playlists-changed", changed);
  }, []);
  async function create() {
    setBusy(true);
    setError("");
    try {
      const { data, error } = await createClient()
        .from("playlists")
        .insert({ owner_id: userId, title: title.trim() })
        .select("id")
        .single();
      if (error) throw error;
      track("playlist_created", {
        playlist_type: "visual",
        playlist_id: data?.id,
      });
      setTitle("");
      setVersion((v) => v + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create playlist.");
    } finally {
      setBusy(false);
    }
  }
  const needle = query.toLowerCase().trim();
  const filtered = items.filter(
    (v) =>
      !needle ||
      `${v.title} ${v.creator.username}`.toLowerCase().includes(needle),
  );
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {selected ? (
        <div className="flex items-center gap-3 border-b px-4 py-3 text-xs">
          <button
            type="button"
            onClick={() => {
              setSelected(null);
              setItems([]);
            }}
          >
            ← Playlists
          </button>
          <span className="min-w-0 flex-1 truncate">{selected.title}</span>
        </div>
      ) : (
        <form
          className="flex gap-2 px-4 py-3"
          onSubmit={(e) => {
            e.preventDefault();
            void create();
          }}
        >
          <input
            aria-label="New visual playlist name"
            value={title}
            maxLength={80}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="New playlist"
            className="min-w-0 flex-1 rounded border bg-transparent p-2 text-xs"
          />
          <button
            type="submit"
            disabled={busy || !title.trim()}
            className="rounded border px-2 text-xs disabled:opacity-50"
          >
            Create
          </button>
        </form>
      )}
      {error && (
        <p role="alert" className="px-4 py-3 text-xs text-destructive">
          {error}{" "}
          <button onClick={() => setVersion((v) => v + 1)}>Retry</button>
        </p>
      )}
      {loading ? (
        <p className="p-4 text-xs">Loading…</p>
      ) : selected ? (
        <VirtualList
          items={filtered}
          rowHeight={64}
          className="min-h-0 flex-1"
          empty={
            <p className="p-4 text-xs text-muted-foreground">
              No visualisations here yet. Use a visualisation’s menu to add it
              to a playlist.
            </p>
          }
          renderRow={
            renderItem ??
            ((vis) => (
              <VisTile
                vis={vis}
                active={vis.id === (onSelect ? activeId : currentId)}
                onSelect={() => onSelect ? onSelect(vis) :
                  useSessionStore.getState().select(vis, filtered)
                }
                owned={vis.ownerId === userId}
                onChanged={() => setVersion((v) => v + 1)}
              />
            ))
          }
        />
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto">
          {playlists
            .filter((p) => p.title.toLowerCase().includes(needle))
            .map((p) => (
              <button
                key={p.id}
                type="button"
                className="block w-full truncate px-4 py-3 text-left text-sm hover:bg-foreground/5"
                onClick={() => setSelected(p)}
              >
                {p.title}
              </button>
            ))}
          {!playlists.length && (
            <p className="p-4 text-xs text-muted-foreground">
              Create a playlist, then add visualisations using their menus.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
