"use client";
import { track as trackAnalytics } from "@/lib/analytics/client";
import { Heart, ListPlus, Search, X, Volume2 } from "lucide-react";
import { useEffect, useState } from "react";
import { SignInDialog } from "@/components/auth/sign-in-dialog";
import { useAuth } from "@/components/auth/auth-provider";
import { useMusicPages } from "@/hooks/use-music-pages";
import { useAudioStore } from "@/lib/store/audio";
import type { HostedTrackSummary } from "@/lib/hosted-audio/types";
import { collectionChanged, musicRequest } from "@/lib/music/client";
import { useChromeStore } from "@/lib/store/chrome";
import { cn } from "@/lib/utils";
import { LoadMore } from "./load-more";
import { MusicPlaylistDialog } from "./music-playlist-dialog";

type Tab = "tracks" | "artists" | "favourites" | "playlists";
type MusicTrack = HostedTrackSummary & { favourite: boolean };
type Context = { type: "artist" | "playlist"; id: string; name: string } | null;
export function MusicLibrary() {
  const { user } = useAuth();
  const [signIn, setSignIn] = useState(false);
  const [tab, setTab] = useState<Tab>("tracks");
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [context, setContext] = useState<Context>(null);
  const [version, setVersion] = useState(0);
  const [error, setError] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [target, setTarget] = useState<HostedTrackSummary | null>(null);
  const [playlists, setPlaylists] = useState<
    { id: string; title: string; trackCount: number }[]
  >([]);
  const [playlistLoaded, setPlaylistLoaded] = useState("");
  const playlistKey = `${user?.id}|${version}`;
  const playlistLoading = playlistLoaded !== playlistKey;
  const [playlistError, setPlaylistError] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [playlistUser, setPlaylistUser] = useState<string | null>(null);
  const kind = useAudioStore((s) => s.kind);
  const current = useAudioStore(
    (s) => s.hostedTracks[s.currentIndex]?.hostedTrackId,
  );
  const playing = useAudioStore((s) => s.isPlaying);
  const playbackError = useAudioStore((s) => s.hostedError);
  useEffect(() => {
    if (!target && !signIn) return;
    useChromeStore.getState().setPinned("a", true);
    return () => useChromeStore.getState().setPinned("a", false);
  }, [target, signIn]);
  useEffect(() => {
    const timer = setTimeout(() => setSearch(query), 250);
    return () => clearTimeout(timer);
  }, [query]);
  useEffect(() => {
    const refresh = () => setVersion((v) => v + 1);
    window.addEventListener("visamp:music-changed", refresh);
    return () => window.removeEventListener("visamp:music-changed", refresh);
  }, []);
  const params = new URLSearchParams({ q: search });
  if (tab === "favourites") params.set("favourites", "true");
  if (tab === "tracks" && context) params.set(context.type, context.id);
  const needsLogin =
    (tab === "favourites" ||
      tab === "playlists" ||
      (tab === "tracks" && context?.type === "playlist")) &&
    !user;
  const tracks = useMusicPages<MusicTrack>(
    (tab === "tracks" || tab === "favourites") && !needsLogin
      ? `/api/music/tracks?${params}&viewer=${user?.id ?? "guest"}`
      : null,
    "tracks",
    version + (user ? 1 : 0),
  );
  const artists = useMusicPages<{ id: string; name: string; slug: string }>(
    tab === "artists"
      ? `/api/music/artists?q=${encodeURIComponent(search)}`
      : null,
    "artists",
  );
  useEffect(() => {
    if (!user || tab !== "playlists") return;
    let active = true;
    musicRequest<{ playlists: typeof playlists }>("/api/music/collections")
      .then((data) => {
        if (active) {
          setPlaylists(data.playlists);
          setPlaylistUser(user.id);
          setPlaylistError("");
        }
      })
      .catch((e) => {
        if (active) setPlaylistError(e.message);
      })
      .finally(() => {
        if (active) setPlaylistLoaded(playlistKey);
      });
    return () => {
      active = false;
    };
  }, [user, tab, version, playlistKey]);
  async function mutate(body: Record<string, unknown>, id: string) {
    if (!user) {
      setError("Sign in to save favourites and playlists.");
      return;
    }
    setPending(id);
    setError("");
    const previousIndex = tracks.items.findIndex((t) => t.id === body.trackId);
    const previous = tracks.items[previousIndex];
    if (body.action === "favourite") {
      tracks.updateItems((items) =>
        tab === "favourites" && body.value === false
          ? items.filter((t) => t.id !== body.trackId)
          : items.map((t) =>
              t.id === body.trackId
                ? { ...t, favourite: Boolean(body.value) }
                : t,
            ),
      );
    }
    try {
      await musicRequest("/api/music/collections", body);
      if (body.action === "favourite") {
        // Keep the optimistic state until the next library refresh.
      } else if (body.action === "remove") {
        tracks.updateItems((items) =>
          items.filter((t) => t.id !== body.trackId),
        );
      } else {
        collectionChanged();
      }
      return true;
    } catch (e) {
      if (body.action === "favourite" && previous) {
        tracks.updateItems((items) => {
          if (items.some((t) => t.id === previous.id))
            return items.map((t) =>
              t.id === previous.id
                ? { ...t, favourite: previous.favourite }
                : t,
            );
          const restored = [...items];
          restored.splice(
            Math.min(previousIndex, restored.length),
            0,
            previous,
          );
          return restored;
        });
      }
      setError(e instanceof Error ? e.message : "Could not update library.");
    } finally {
      setPending(null);
    }
  }
  function choose(next: Context) {
    if (next) trackAnalytics("content_selected", { content_type: next.type, content_id: next.id, source_panel: "audio" });
    setContext(next);
    setQuery("");
    setSearch("");
    setTab("tracks");
  }
  const visiblePlaylists =
    playlistUser === user?.id
      ? playlists.filter((p) =>
          p.title.toLowerCase().includes(search.toLowerCase()),
        )
      : [];
  return (
    <section className="flex min-h-0 flex-1 flex-col">
      <div
        className="flex flex-wrap gap-x-4 border-b px-4"
        aria-label="Music library tabs"
      >
        {(["tracks", "artists", "favourites", "playlists"] as Tab[]).map(
          (value) => (
            <button
              key={value}
              type="button"
              aria-pressed={tab === value}
              onClick={() => {
                setTab(value);
                setError("");
              }}
              className={cn(
                "border-b-2 py-3 text-xs capitalize",
                tab === value
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground",
              )}
            >
              {value}
            </button>
          ),
        )}
      </div>
      <div className="shrink-0 space-y-2 px-4 py-3">
        <label className="flex items-center gap-2 rounded border px-2 py-2">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            aria-label="Search music"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search ${tab}`}
            className="min-w-0 flex-1 bg-transparent text-xs outline-none"
          />
        </label>
        {tab === "tracks" && context && (
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="truncate">{context.name}</span>
            <button
              aria-label="Clear music filter"
              type="button"
              onClick={() => choose(null)}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
        <a
          href="/manage-artists"
          className="block text-right text-xs text-muted-foreground underline"
        >
          Manage my artists & music
        </a>
      </div>
      {(error || playbackError) && (
        <p role="alert" className="px-4 pb-2 text-xs text-destructive">
          {error || playbackError}{" "}
          {!user && (
            <button
              type="button"
              onClick={() => setSignIn(true)}
              className="underline"
            >
              Sign in
            </button>
          )}
        </p>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {needsLogin ? (
          <p className="px-4 py-5 text-sm">
            <button
              type="button"
              onClick={() => setSignIn(true)}
              className="underline"
            >
              Sign in
            </button>{" "}
            to use favourites and playlists.
          </p>
        ) : tab === "artists" ? (
          <>
            {artists.items.map((a) => (
              <div
                key={a.id}
                className="flex items-center gap-3 px-4 py-3 hover:bg-foreground/5"
              >
                <button
                  type="button"
                  className="min-w-0 flex-1 truncate text-left text-sm"
                  onClick={() =>
                    choose({ type: "artist", id: a.slug, name: a.name })
                  }
                >
                  {a.name}
                </button>
                <a
                  href={`/artists/${a.slug}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 text-xs text-muted-foreground underline"
                >
                  Profile
                </a>
              </div>
            ))}
            {artists.error && (
              <p role="alert" className="px-4 text-xs text-destructive">
                {artists.error}
              </p>
            )}
            {!artists.loading && !artists.items.length && !artists.error && (
              <p className="px-4 py-5 text-xs text-muted-foreground">
                No artists found.
              </p>
            )}
            <LoadMore
              more={artists.more}
              loading={artists.loading}
              hasMore={!artists.error && artists.next !== null}
            />
            {artists.error && (
              <button onClick={artists.more} className="p-4 text-xs">
                Retry
              </button>
            )}
          </>
        ) : tab === "playlists" ? (
          <>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void mutate(
                  { action: "create", title: newTitle },
                  "create",
                ).then((saved) => {
                  if (saved) setNewTitle("");
                });
              }}
              className="flex gap-2 px-4 pb-3"
            >
              <input
                aria-label="New music playlist"
                value={newTitle}
                maxLength={80}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="New playlist"
                className="min-w-0 flex-1 rounded border bg-transparent p-2 text-xs"
              />
              <button
                type="submit"
                disabled={!!pending || !newTitle.trim()}
                className="rounded border px-2 text-xs disabled:opacity-50"
              >
                Create
              </button>
            </form>
            {playlistLoading && <p className="px-4 text-xs">Loading…</p>}
            {playlistError && (
              <p role="alert" className="px-4 text-xs text-destructive">
                {playlistError}
              </p>
            )}
            {visiblePlaylists.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() =>
                  choose({ type: "playlist", id: p.id, name: p.title })
                }
                className="block w-full truncate px-4 py-3 text-left text-sm hover:bg-foreground/5"
              >
                {p.title} - {p.trackCount}{" "}
                {p.trackCount === 1 ? "track" : "tracks"}
              </button>
            ))}
            {!playlistLoading && !playlistError && !visiblePlaylists.length && (
              <p className="px-4 py-5 text-xs text-muted-foreground">
                No playlists found. Add tracks with the playlist button.
              </p>
            )}
          </>
        ) : (
          <>
            {tracks.items.map((track) => (
              <div
                key={track.id}
                className={cn(
                  "flex cursor-pointer items-center gap-2 px-4 py-2 [&_button]:cursor-pointer",
                  kind === "hosted" && current === track.id
                    ? "bg-foreground/10"
                    : "hover:bg-foreground/5",
                )}
              >
                <button
                  type="button"
                  aria-label={`Play ${track.title}`}
                  onClick={() =>
                    void useAudioStore
                      .getState()
                      .playHostedSelection(track.id, tracks.items, {
                        url: `/api/music/tracks?${params}`,
                        nextOffset: tracks.next,
                      })
                  }
                  className="relative h-11 w-11 shrink-0 overflow-hidden rounded bg-foreground/5"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- signed artwork redirects */}
                  <img
                    src={track.artworkUrl ?? "/VA.svg"}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                </button>
                <div className="min-w-0 flex-1">
                  <button
                    type="button"
                    onClick={() =>
                      void useAudioStore
                        .getState()
                        .playHostedSelection(track.id, tracks.items, {
                          url: `/api/music/tracks?${params}`,
                          nextOffset: tracks.next,
                        })
                    }
                    className="block w-full truncate text-left text-xs"
                  >
                    {track.title}
                  </button>
                  <a
                    href={`/artists/${track.artistSlug}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-block max-w-full truncate align-middle text-[11px] text-muted-foreground hover:underline"
                  >
                    {track.artist}
                  </a>
                </div>
                {kind === "hosted" && current === track.id && playing && (
                  <Volume2
                    aria-label="Playing"
                    className="h-4 w-4 shrink-0 text-primary"
                  />
                )}
                <button
                  type="button"
                  aria-label={`${track.favourite ? "Unfavourite" : "Favourite"} ${track.title}`}
                  aria-pressed={track.favourite}
                  disabled={pending !== null}
                  onClick={() =>
                    void mutate(
                      {
                        action: "favourite",
                        trackId: track.id,
                        value: !track.favourite,
                      },
                      track.id,
                    )
                  }
                  className="shrink-0 p-1.5 text-muted-foreground hover:text-foreground disabled:opacity-50"
                >
                  <Heart
                    className={cn(
                      "h-4 w-4",
                      track.favourite && "fill-primary text-primary",
                    )}
                  />
                </button>
                <button
                  type="button"
                  aria-label={`Add ${track.title} to playlist`}
                  onClick={() =>
                    user
                      ? setTarget(track)
                      : setError("Sign in to save playlists.")
                  }
                  className="shrink-0 p-1.5 text-muted-foreground hover:text-foreground"
                >
                  <ListPlus className="h-4 w-4" />
                </button>
                {context?.type === "playlist" && tab === "tracks" && (
                  <button
                    type="button"
                    disabled={!!pending}
                    aria-label={`Remove ${track.title} from playlist`}
                    onClick={() =>
                      void mutate(
                        {
                          action: "remove",
                          playlistId: context.id,
                          trackId: track.id,
                        },
                        track.id,
                      )
                    }
                    className="shrink-0 p-1"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
            ))}
            {!tracks.loading && !tracks.items.length && !tracks.error && (
              <p className="px-4 py-5 text-xs text-muted-foreground">
                {tab === "favourites"
                  ? "No favourites yet. Use the heart beside a track."
                  : "No tracks found."}
              </p>
            )}
            {tracks.error && (
              <p role="alert" className="px-4 text-xs text-destructive">
                {tracks.error}
              </p>
            )}
            <LoadMore
              more={tracks.more}
              loading={tracks.loading}
              hasMore={!tracks.error && tracks.next !== null}
            />
            {tracks.error && (
              <button
                type="button"
                onClick={tracks.more}
                className="p-4 text-xs"
              >
                Retry
              </button>
            )}
          </>
        )}
      </div>
      <SignInDialog open={signIn} onOpenChange={setSignIn} />
      {target && user && (
        <MusicPlaylistDialog track={target} close={() => setTarget(null)} />
      )}
    </section>
  );
}
