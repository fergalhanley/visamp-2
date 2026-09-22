"use client";
import { useEffect, useState } from "react";
import { TopBar } from "@/components/chrome/top-bar";
import { musicRequest, collectionChanged } from "@/lib/music/client";
import { useMusicPages } from "@/hooks/use-music-pages";
import { LoadMore } from "@/components/panels/load-more";
import type { HostedTrackSummary } from "@/lib/hosted-audio/types";
type Playlist = { id: string; title: string; trackCount: number };
const field = "rounded-md border border-white/15 bg-white/5 px-3 py-2 text-sm";
const button =
  "cursor-pointer rounded-md border border-white/15 px-3 py-2 text-sm hover:bg-white/10 disabled:cursor-default disabled:opacity-40";
export function PlaylistManager({ initialId }: { initialId: string }) {
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [selected, setSelected] = useState(initialId);
  const [version, setVersion] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [filter, setFilter] = useState("");
  useEffect(() => {
    let active = true;
    setLoading(true);
    musicRequest<{ playlists: Playlist[] }>("/api/music/collections")
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
  }, [version]);
  function select(id: string) {
    setSelected(id);
    history.replaceState(
      null,
      "",
      id ? `/playlists?playlist=${encodeURIComponent(id)}` : "/playlists",
    );
  }
  async function mutate(body: Record<string, unknown>) {
    if (busy) return false;
    setBusy(true);
    setError("");
    try {
      const result = await musicRequest<{ playlist?: Playlist }>(
        "/api/music/collections",
        body,
      );
      if (body.action === "create" && result.playlist) {
        select(result.playlist.id);
        setNewTitle("");
      }
      if (body.action === "delete") select("");
      setVersion((v) => v + 1);
      collectionChanged();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save playlist.");
      return false;
    } finally {
      setBusy(false);
    }
  }
  const current = playlists.find((p) => p.id === selected);
  return (
    <div className="min-h-screen bg-[#0b0e10] text-foreground">
      <TopBar position="static" />
      <main className="mx-auto max-w-7xl space-y-6 p-6">
        <header>
          <h1 className="text-3xl font-medium">My Playlists</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Organise your VisAmp Music playlists for listening and building
            sets.
          </p>
        </header>
        {error && (
          <div role="alert" className="text-sm text-rose-300">
            {error}{" "}
            <button
              className="underline"
              onClick={() => {
                setError("");
                setVersion((v) => v + 1);
              }}
            >
              Retry loading
            </button>
          </div>
        )}
        <div className="grid gap-6 md:grid-cols-[280px_minmax(0,1fr)]">
          <aside className="space-y-4">
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void mutate({ action: "create", title: newTitle });
              }}
            >
              <input
                aria-label="New playlist name"
                placeholder="New playlist name"
                maxLength={80}
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                className={`${field} min-w-0 flex-1`}
              />
              <button className={button} disabled={busy || !newTitle.trim()}>
                Create
              </button>
            </form>
            <input
              aria-label="Filter playlists"
              placeholder="Find a playlist"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className={`${field} w-full`}
            />
            {loading && (
              <p role="status" className="text-sm">
                Loading playlists…
              </p>
            )}
            <ul className="space-y-2">
              {playlists
                .filter((p) =>
                  p.title.toLowerCase().includes(filter.toLowerCase()),
                )
                .map((p) => (
                  <li key={p.id}>
                    <button
                      disabled={busy}
                      aria-pressed={selected === p.id}
                      onClick={() => select(p.id)}
                      className={`${button} w-full text-left ${selected === p.id ? "border-fuchsia-400 bg-fuchsia-400/10" : ""}`}
                    >
                      <span className="block truncate">{p.title}</span>
                      <span className="text-xs text-muted-foreground">
                        {p.trackCount} {p.trackCount === 1 ? "track" : "tracks"}
                      </span>
                    </button>
                  </li>
                ))}
            </ul>
            {!loading && !playlists.length && (
              <p className="text-sm text-muted-foreground">
                Create your first playlist to start adding music.
              </p>
            )}
          </aside>
          {current ? (
            <PlaylistEditor
              key={current.id}
              playlist={current}
              version={version}
              busy={busy}
              mutate={mutate}
            />
          ) : (
            <p className="rounded-xl border border-white/10 p-8 text-muted-foreground">
              {selected && !loading
                ? "This playlist is unavailable. Select another playlist or create one."
                : "Select a playlist to manage its tracks."}
            </p>
          )}
        </div>
      </main>
    </div>
  );
}
function PlaylistEditor({
  playlist,
  version,
  busy,
  mutate,
}: {
  playlist: Playlist;
  version: number;
  busy: boolean;
  mutate: (body: Record<string, unknown>) => Promise<boolean>;
}) {
  const [title, setTitle] = useState(playlist.title);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setSearch(query), 250);
    return () => clearTimeout(timer);
  }, [query]);
  const tracks = useMusicPages<HostedTrackSummary>(
    `/api/music/tracks?playlist=${encodeURIComponent(playlist.id)}`,
    "tracks",
    version,
  );
  const library = useMusicPages<HostedTrackSummary>(
    adding ? `/api/music/tracks?q=${encodeURIComponent(search)}` : null,
    "tracks",
    version,
  );
  function list(page: typeof tracks, add: boolean) {
    return (
      <>
        <ul className="divide-y divide-white/10">
          {page.items.map((t) => (
            <li key={t.id} className="flex items-center gap-3 py-3">
              {/* eslint-disable-next-line @next/next/no-img-element -- signed artwork redirects */}
              <img
                src={t.artworkUrl || "/VA.svg"}
                alt=""
                className="h-10 w-10 rounded object-cover"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm">{t.title}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {t.artist}
                </p>
              </div>
              <button
                className={button}
                disabled={busy}
                onClick={() =>
                  void mutate({
                    action: add ? "add" : "remove",
                    playlistId: playlist.id,
                    trackId: t.id,
                  })
                }
              >
                {add ? "Add" : "Remove"}
              </button>
            </li>
          ))}
        </ul>
        {page.error && (
          <p role="alert" className="text-sm text-rose-300">
            {page.error}{" "}
            <button onClick={page.more} className="underline">
              Retry
            </button>
          </p>
        )}
        {!page.loading && !page.error && !page.items.length && (
          <p className="py-6 text-sm text-muted-foreground">
            {add
              ? "No matching tracks."
              : "No playable tracks yet. Add tracks from VisAmp Music below."}
          </p>
        )}
        <LoadMore
          more={page.more}
          loading={page.loading}
          hasMore={!page.error && page.next !== null}
        />
      </>
    );
  }
  return (
    <section className="space-y-5 rounded-xl border border-white/10 p-5">
      <form
        className="flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void mutate({ action: "rename", playlistId: playlist.id, title });
        }}
      >
        <input
          aria-label="Playlist name"
          value={title}
          maxLength={80}
          onChange={(e) => setTitle(e.target.value)}
          className={`${field} min-w-0 flex-1`}
        />
        <button
          className={button}
          disabled={busy || !title.trim() || title === playlist.title}
        >
          Save name
        </button>
        <button
          type="button"
          className={`${button} text-rose-300`}
          disabled={busy}
          onClick={() => {
            if (confirm(`Delete “${playlist.title}”? This cannot be undone.`))
              void mutate({ action: "delete", playlistId: playlist.id });
          }}
        >
          Delete playlist
        </button>
      </form>
      <div>
        <h2 className="text-lg font-medium">Tracks</h2>
        {list(tracks, false)}
      </div>
      <button
        className={button}
        aria-expanded={adding}
        onClick={() => setAdding(!adding)}
      >
        {adding ? "Close music library" : "Add tracks"}
      </button>
      {adding && (
        <div className="border-t border-white/10 pt-4">
          <input
            aria-label="Search tracks to add"
            placeholder="Search VisAmp Music"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className={`${field} mb-2 w-full`}
          />
          {list(library, true)}
        </div>
      )}
    </section>
  );
}
