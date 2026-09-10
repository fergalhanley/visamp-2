"use client";

import { VisampCanvas } from "@visamp/player";
import { ChevronDown, Search } from "lucide-react";
import { useMemo, useRef, useState } from "react";

import { TopBar } from "@/components/chrome/top-bar";
import { EditorTransport } from "@/components/editor/editor-transport";
import { CommentsThread } from "@/components/panels/comments-thread";
import { formatCount, posterStyle } from "@/components/panels/tiles";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAnalyser } from "@/hooks/use-analyser";
import { useCreatorGallery, useCreatorWork, type CreatorStats } from "@/hooks/use-creator-gallery";
import { useFullscreen } from "@/hooks/use-fullscreen";
import { DEFAULT_SOURCE } from "@/lib/dsl/default";
import type { Visualisation } from "@/lib/types";
import { cn } from "@/lib/utils";

type Sort = "name" | "views" | "likes" | "vis";

const SORT_LABELS: Record<Sort, string> = {
  name: "Name",
  views: "Views",
  likes: "Likes",
  vis: "Visualisations",
};

function sortCreators(items: CreatorStats[], by: Sort): CreatorStats[] {
  const sorted = [...items];
  sorted.sort((a, b) => {
    switch (by) {
      case "name":
        return a.creator.username.localeCompare(b.creator.username);
      case "views":
        return b.views - a.views;
      case "likes":
        return b.likes - a.likes;
      case "vis":
        return b.visCount - a.visCount;
    }
  });
  return sorted;
}

/**
 * E3.7 — the creator gallery.
 *
 * A page rather than a panel tab: three columns of increasing specificity —
 * who, what they made, and the thing itself playing — which is more than the
 * V panel's single 22rem column could carry.
 *
 * Like the editor, this route owns the canvas. The WASM engine binds to the
 * first stage in the document and refuses to re-initialise, so the player's
 * canvas cannot be mounted at the same time; `SessionShell` stands the player
 * down here, and getting in and out is a full page load.
 */
export function CreatorGallery({ initialUsername = null }: { initialUsername?: string | null }) {
  const { items, loading, error } = useCreatorGallery();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("views");

  // Null means "no explicit pick yet", which resolves to the top of the list.
  // Derived rather than synced in an effect, so the page arrives populated
  // instead of empty-then-filled.
  const [pickedCreator, setPickedCreator] = useState<string | null>(initialUsername);
  const [pickedVis, setPickedVis] = useState<string | null>(null);

  const analyser = useAnalyser();
  const previewRef = useRef<HTMLDivElement>(null);
  const { toggle: toggleFullscreen } = useFullscreen(previewRef);

  const needle = query.trim().toLowerCase();
  const creators = useMemo(() => {
    const filtered = needle
      ? items.filter(
          (row) =>
            row.creator.username.toLowerCase().includes(needle),
        )
      : items;
    return sortCreators(filtered, sort);
  }, [items, needle, sort]);

  const activeCreator =
    creators.find((row) => row.creator.username === pickedCreator) ?? creators[0] ?? null;

  const { items: work, loading: workLoading } = useCreatorWork(activeCreator?.id ?? null);
  const activeVis: Visualisation | null =
    work.find((vis) => vis.id === pickedVis) ?? work[0] ?? null;

  return (
    <div className="flex h-dvh flex-col bg-background">
      <TopBar position="static" />

      <div className="flex min-h-0 flex-1">
        {/* Creators and their work share one accordion column. At 27rem this is
            50% wider than the original 18rem creator list. */}
        <aside className="flex w-[27rem] shrink-0 flex-col border-r">
          <div className="shrink-0 space-y-2 border-b p-3">
            <div className="flex items-center gap-2 rounded-md border px-2 py-1.5">
              <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Filter creators"
                aria-label="Filter creators"
                className="w-full bg-transparent text-xs outline-none placeholder:text-muted-foreground"
              />
            </div>

            <label className="flex items-center justify-between text-xs text-muted-foreground">
              Sort by
              <select
                value={sort}
                onChange={(event) => setSort(event.target.value as Sort)}
                className="rounded-md border bg-transparent px-2 py-1 text-xs"
              >
                {Object.entries(SORT_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {loading ? (
              <p className="px-4 py-6 text-xs text-muted-foreground">Loading…</p>
            ) : error ? (
              <p className="px-4 py-6 text-xs text-destructive">{error}</p>
            ) : creators.length === 0 ? (
              <p className="px-4 py-6 text-xs text-muted-foreground">No matches.</p>
            ) : (
              creators.map((row) => {
                const expanded = row.id === activeCreator?.id;

                return (
                  <div key={row.id} className="border-b last:border-b-0">
                    <button
                      type="button"
                      aria-expanded={expanded}
                      onClick={() => {
                        setPickedCreator(row.creator.username);
                        window.history.pushState(
                          {},
                          "",
                          `/creators/${encodeURIComponent(row.creator.username)}`,
                        );
                        // Their work is a different list; keeping a selection
                        // from the last creator would point at nothing.
                        if (!expanded) setPickedVis(null);
                      }}
                      className={cn(
                        "flex w-full cursor-pointer items-center gap-3 px-4 py-2 text-left transition",
                        expanded ? "bg-foreground/10" : "hover:bg-foreground/5",
                      )}
                    >
                      <Avatar className="h-10 w-10 shrink-0">
                        {row.creator.avatarUrl && (
                          <AvatarImage
                            src={row.creator.avatarUrl}
                            alt={`${row.creator.username}'s avatar`}
                          />
                        )}
                        <AvatarFallback style={posterStyle(row.creator.username)}>
                          <span className="sr-only">{row.creator.username}</span>
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {row.creator.username}
                        </p>
                        <p className="truncate text-[11px] text-muted-foreground">
                          {formatCount(row.views)} views · {formatCount(row.likes)} likes ·{" "}
                          {row.visCount} vis
                        </p>
                      </div>
                      <ChevronDown
                        className={cn(
                          "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                          expanded && "rotate-180",
                        )}
                        aria-hidden
                      />
                    </button>

                    {expanded && (
                      <div className="bg-foreground/[0.025] py-1">
                        {workLoading ? (
                          <p className="px-16 py-4 text-xs text-muted-foreground">
                            Loading…
                          </p>
                        ) : work.length === 0 ? (
                          <p className="px-16 py-4 text-xs text-muted-foreground">
                            Nothing public here.
                          </p>
                        ) : (
                          work.map((vis) => (
                            <button
                              key={vis.id}
                              type="button"
                              onClick={() => setPickedVis(vis.id)}
                              className={cn(
                                "flex w-full cursor-pointer items-center gap-3 py-2 pl-16 pr-4 text-left transition",
                                vis.id === activeVis?.id
                                  ? "bg-foreground/10"
                                  : "hover:bg-foreground/5",
                              )}
                            >
                              <div
                                className="aspect-video h-10 shrink-0 rounded-md"
                                style={posterStyle(vis.id)}
                                aria-hidden
                              />
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm">{vis.title}</p>
                                <p className="truncate text-[11px] text-muted-foreground">
                                  {formatCount(vis.viewCount)} views ·{" "}
                                  {formatCount(vis.likeCount)} likes
                                </p>
                              </div>
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </aside>

        {/* The selected visualisation. */}
        <main className="flex min-w-0 flex-1 flex-col">
          {/* 16:9 to the column width, as in the editor. Double-click for
              fullscreen matches both the editor and the player. */}
          <div className="flex shrink-0 items-stretch border-b">
            <aside className="w-56 shrink-0 p-4">
              {activeCreator ? (
                <div className="flex h-full flex-col items-center justify-center text-center">
                  <Avatar className="h-20 w-20">
                    {activeCreator.creator.avatarUrl && (
                      <AvatarImage
                        src={activeCreator.creator.avatarUrl}
                        alt={`${activeCreator.creator.username}'s avatar`}
                      />
                    )}
                    <AvatarFallback className="text-xl">
                      {activeCreator.creator.username.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <h1 className="mt-3 text-sm font-medium">
                    {activeCreator.creator.username}
                  </h1>
                  <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
                    {activeCreator.creator.bio || "This creator has not added a bio yet."}
                  </p>
                </div>
              ) : null}
            </aside>
            <div
              ref={previewRef}
              onDoubleClick={toggleFullscreen}
              className="aspect-video min-w-0 flex-1 bg-black"
            >
              <VisampCanvas
                source={activeVis?.source ?? DEFAULT_SOURCE}
                active
                analyser={analyser}
                className="h-full w-full"
              />
            </div>
          </div>

          <EditorTransport fullscreenTarget={previewRef} />

          <div className="min-h-0 flex-1 border-t p-3">
            {activeVis ? (
              <>
                <p className="mb-2 shrink-0 truncate text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {activeVis.commentCount === 1
                    ? "1 Comment"
                    : `${activeVis.commentCount} Comments`}
                </p>
                {/* Keyed so a draft in the box belongs to the thread it was
                    written against. */}
                <CommentsThread
                  key={activeVis.id}
                  vis={activeVis}
                  active
                  className="h-[calc(100%-1.75rem)]"
                />
              </>
            ) : (
              <p className="text-xs text-muted-foreground">
                Pick a visualisation to play it.
              </p>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
