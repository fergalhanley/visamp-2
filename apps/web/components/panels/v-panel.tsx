"use client";

import { Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { AccountMenu } from "@/components/auth/account-menu";
import { useAuth } from "@/components/auth/auth-provider";
import { BrandLockup } from "@/components/brand/logo";
import { Panel } from "@/components/panels/panel";
import { VisTile } from "@/components/panels/tiles";
import { VirtualList } from "@/components/panels/virtual-list";
import { useBrowseVisualisations } from "@/hooks/use-browse";
import { useFavouriteVisualisations } from "@/hooks/use-favourite-visualisations";
import { useMyVisualisations } from "@/hooks/use-my-visualisations";
import { useSessionStore } from "@/lib/store/session";
import { cn } from "@/lib/utils";

const ROW_HEIGHT = 64;

type Tab = "visualisations" | "mine" | "favourites";

const TAB_LABELS: Record<Tab, string> = {
  visualisations: "Visualisations",
  mine: "My Visualisations",
  favourites: "Favourites",
};

export function VPanel() {
  const [tab, setTab] = useState<Tab>("visualisations");
  const [query, setQuery] = useState("");

  const currentId = useSessionStore((s) => s.current.id);
  const select = useSessionStore((s) => s.select);

  const { user } = useAuth();
  const {
    items: mine,
    loading: mineLoading,
    error: mineError,
    refresh: refreshMine,
  } = useMyVisualisations();
  const {
    items: favourites,
    loading: favouritesLoading,
    error: favouritesError,
    refresh: refreshFavourites,
  } = useFavouriteVisualisations();
  const {
    items: publicVis,
    loading: browseLoading,
    error: browseError,
  } = useBrowseVisualisations();

  // Next/prev should walk what this panel shows, not the fixtures the store
  // starts with. Seeded from here because this is where the list already is —
  // fetching it a second time in the shell would double the query.
  useEffect(() => {
    useSessionStore.getState().seedFromBrowse(publicVis);
  }, [publicVis]);
  const needle = query.trim().toLowerCase();

  // The tab only exists while signed in; falling back keeps the panel sane if
  // someone signs out while looking at it.
  const tabs: Tab[] = user
    ? ["visualisations", "mine", "favourites"]
    : ["visualisations"];
  const activeTab: Tab = tabs.includes(tab) ? tab : "visualisations";

  const myFiltered = useMemo(() => {
    if (!mine) return [];
    if (!needle) return mine;
    return mine.filter((v) => v.title.toLowerCase().includes(needle));
  }, [mine, needle]);

  const favouritesFiltered = useMemo(() => {
    if (!favourites) return [];
    if (!needle) return favourites;
    return favourites.filter(
      (vis) =>
        vis.title.toLowerCase().includes(needle) ||
        vis.artist.username.toLowerCase().includes(needle),
    );
  }, [favourites, needle]);

  const visualisations = useMemo(
    () =>
      needle
        ? publicVis.filter(
            (v) =>
              v.title.toLowerCase().includes(needle) ||
              v.artist.username.toLowerCase().includes(needle),
          )
        : publicVis,
    [publicVis, needle],
  );

  return (
    <Panel side="v" label="Browse">
      {/* E3.1 */}
      <header className="flex shrink-0 items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-4">
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- reset the engine when leaving the player */}
          <a href="/" aria-label="VisAmp home"><BrandLockup className="h-6" /></a>
          {/* The gallery owns a canvas, so it needs a fresh document rather
              than client-side navigation away from the player. */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a
            href="/artists"
            className="text-xs text-muted-foreground transition hover:text-foreground"
          >
            Artists
          </a>
        </div>
        <AccountMenu />
      </header>

      {/* E3.4 */}
      <div className="shrink-0 border-b px-4 py-3">
        <div className="flex items-center gap-2 rounded-md border px-2 py-1.5">
          <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter"
            className="w-full bg-transparent text-xs outline-none placeholder:text-muted-foreground"
          />
        </div>
      </div>

      {/* E3.5 — the second tab appears once someone is signed in. */}
      <div className="flex shrink-0 items-center gap-4 border-b px-4">
        {tabs.map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setTab(value)}
            className={cn(
              "-mb-px whitespace-nowrap border-b-2 py-2 text-xs transition",
              activeTab === value
                ? "border-foreground font-medium"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {TAB_LABELS[value]}
          </button>
        ))}
      </div>

      {activeTab === "visualisations" &&
        (browseLoading ? (
          <p className="px-4 py-6 text-xs text-muted-foreground">Loading…</p>
        ) : browseError ? (
          <p className="px-4 py-6 text-xs text-destructive">{browseError}</p>
        ) : (
        <VirtualList
          items={visualisations}
          rowHeight={ROW_HEIGHT}
          className="min-h-0 flex-1"
          empty={<p className="px-4 py-6 text-xs text-muted-foreground">No matches.</p>}
          renderRow={(vis) => (
            <VisTile
              vis={vis}
              active={vis.id === currentId}
              // E3.10 — picking a tile also sets the playing context.
              onSelect={() => select(vis, visualisations)}
              owned={Boolean(user && vis.ownerId === user.id)}
              onChanged={refreshMine}
            />
          )}
        />
        ))}

      {activeTab === "mine" &&
        (mineLoading ? (
          <p className="px-4 py-6 text-xs text-muted-foreground">Loading…</p>
        ) : mineError ? (
          <p className="px-4 py-6 text-xs text-destructive">{mineError}</p>
        ) : mine && mine.length === 0 ? (
          <p className="px-4 py-6 text-xs text-muted-foreground">
            Nothing yet. Use <span className="text-foreground">Create Vis</span> to
            start one.
          </p>
        ) : (
          <VirtualList
            items={myFiltered}
            rowHeight={ROW_HEIGHT}
            className="min-h-0 flex-1"
            empty={<p className="px-4 py-6 text-xs text-muted-foreground">No matches.</p>}
            renderRow={(vis) => (
              <VisTile
                vis={vis}
                active={vis.id === currentId}
                onSelect={() => select(vis, myFiltered)}
                owned
                onChanged={refreshMine}
              />
            )}
          />
        ))}

      {activeTab === "favourites" &&
        (favouritesLoading ? (
          <p className="px-4 py-6 text-xs text-muted-foreground">Loading…</p>
        ) : favouritesError ? (
          <p className="px-4 py-6 text-xs text-destructive">{favouritesError}</p>
        ) : favourites && favourites.length === 0 ? (
          <p className="px-4 py-6 text-xs text-muted-foreground">
            No favourites yet. Use the heart on the player to add one.
          </p>
        ) : (
          <VirtualList
            items={favouritesFiltered}
            rowHeight={ROW_HEIGHT}
            className="min-h-0 flex-1"
            empty={<p className="px-4 py-6 text-xs text-muted-foreground">No matches.</p>}
            renderRow={(vis) => (
              <VisTile
                vis={vis}
                active={vis.id === currentId}
                onSelect={() => select(vis, favouritesFiltered)}
                owned={Boolean(user && vis.ownerId === user.id)}
                onChanged={() => {
                  refreshFavourites();
                  refreshMine();
                }}
              />
            )}
          />
        ))}
    </Panel>
  );
}
