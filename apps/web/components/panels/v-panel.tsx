"use client";

import { Search, Shuffle } from "lucide-react";
import { useMemo, useState } from "react";

import { AccountMenu } from "@/components/auth/account-menu";
import { useAuth } from "@/components/auth/auth-provider";
import { BrandLockup } from "@/components/brand/logo";
import { Panel } from "@/components/panels/panel";
import { ArtistTile, VisTile } from "@/components/panels/tiles";
import { VirtualList } from "@/components/panels/virtual-list";
import { useArtists, useBrowseVisualisations } from "@/hooks/use-browse";
import { useMyVisualisations } from "@/hooks/use-my-visualisations";
import { useSessionStore } from "@/lib/store/session";
import { INTERVAL_CHOICES, type PlayerMode } from "@/lib/types";
import { cn } from "@/lib/utils";

const ROW_HEIGHT = 64;

const MODES: { value: PlayerMode; label: string }[] = [
  { value: "track-audio", label: "Per track" },
  { value: "time-interval", label: "Timed" },
  { value: "manual", label: "Manual" },
];

function formatInterval(seconds: number): string {
  return seconds < 60 ? `${seconds}s` : `${seconds / 60}m`;
}

/** E3.2 — mode, interval and the two independent shuffle toggles. */
function PlayerModeControls() {
  const mode = useSessionStore((s) => s.mode);
  const setMode = useSessionStore((s) => s.setMode);
  const intervalSec = useSessionStore((s) => s.intervalSec);
  const setIntervalSec = useSessionStore((s) => s.setIntervalSec);
  const shuffleVis = useSessionStore((s) => s.shuffleVis);
  const shuffleTracks = useSessionStore((s) => s.shuffleTracks);
  const toggleShuffleVis = useSessionStore((s) => s.toggleShuffleVis);
  const toggleShuffleTracks = useSessionStore((s) => s.toggleShuffleTracks);

  const timed = mode === "time-interval";

  return (
    <div className="space-y-3 border-b px-4 py-3">
      <div className="grid grid-cols-3 gap-1 rounded-lg bg-foreground/5 p-1">
        {MODES.map(({ value, label }) => (
          <button
            key={value}
            type="button"
            onClick={() => setMode(value)}
            className={cn(
              "rounded-md px-2 py-1.5 text-xs transition",
              mode === value
                ? "bg-foreground/15 font-medium"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <label
        className={cn(
          "flex items-center justify-between text-xs transition",
          timed ? "text-foreground" : "text-muted-foreground/50",
        )}
      >
        Change every
        <select
          value={intervalSec}
          disabled={!timed}
          onChange={(event) => setIntervalSec(Number(event.target.value))}
          className="rounded-md border bg-transparent px-2 py-1 text-xs disabled:opacity-50"
        >
          {INTERVAL_CHOICES.map((seconds) => (
            <option key={seconds} value={seconds}>
              {formatInterval(seconds)}
            </option>
          ))}
        </select>
      </label>

      <div className="flex gap-2">
        <ShuffleToggle
          label="Visualisations"
          active={shuffleVis}
          onToggle={toggleShuffleVis}
        />
        <ShuffleToggle
          label="Tracks"
          active={shuffleTracks}
          onToggle={toggleShuffleTracks}
        />
      </div>
    </div>
  );
}

function ShuffleToggle({
  label,
  active,
  onToggle,
}: {
  label: string;
  active: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={active}
      // The visible text is just "Visualisations" / "Tracks", which collides
      // with the tab of the same name; spell the purpose out for assistive tech.
      aria-label={`Shuffle ${label.toLowerCase()}`}
      className={cn(
        "flex flex-1 items-center justify-center gap-1.5 rounded-md border px-2 py-1.5 text-xs transition",
        active
          ? "border-foreground/30 bg-foreground/10"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      <Shuffle className="h-3 w-3" />
      {label}
    </button>
  );
}

type Tab = "visualisations" | "artists" | "mine";

const TAB_LABELS: Record<Tab, string> = {
  visualisations: "Visualisations",
  artists: "Artists",
  mine: "My Visualisations",
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
    items: publicVis,
    loading: browseLoading,
    error: browseError,
  } = useBrowseVisualisations();
  const {
    items: allArtists,
    loading: artistsLoading,
    error: artistsError,
  } = useArtists();

  const needle = query.trim().toLowerCase();

  // The tab only exists while signed in; falling back keeps the panel sane if
  // someone signs out while looking at it.
  const tabs: Tab[] = user
    ? ["visualisations", "artists", "mine"]
    : ["visualisations", "artists"];
  const activeTab: Tab = tabs.includes(tab) ? tab : "visualisations";

  const myFiltered = useMemo(() => {
    if (!mine) return [];
    if (!needle) return mine;
    return mine.filter((v) => v.title.toLowerCase().includes(needle));
  }, [mine, needle]);

  const visualisations = useMemo(
    () =>
      needle
        ? publicVis.filter(
            (v) =>
              v.title.toLowerCase().includes(needle) ||
              v.artist.displayName.toLowerCase().includes(needle),
          )
        : publicVis,
    [publicVis, needle],
  );

  const artists = useMemo(
    () =>
      needle
        ? allArtists.filter(
            (a) =>
              a.displayName.toLowerCase().includes(needle) ||
              a.username.toLowerCase().includes(needle),
          )
        : allArtists,
    [allArtists, needle],
  );

  return (
    <Panel side="v" label="Browse">
      {/* E3.1 */}
      <header className="flex shrink-0 items-center justify-between border-b px-4 py-3">
        <BrandLockup className="h-6" />
        <AccountMenu />
      </header>

      <PlayerModeControls />

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

      {/* E3.5 — the third tab appears once someone is signed in. */}
      <div className="flex shrink-0 gap-4 border-b px-4">
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

      {activeTab === "artists" &&
        (artistsLoading ? (
          <p className="px-4 py-6 text-xs text-muted-foreground">Loading…</p>
        ) : artistsError ? (
          <p className="px-4 py-6 text-xs text-destructive">{artistsError}</p>
        ) : (
          <VirtualList
            items={artists}
            rowHeight={ROW_HEIGHT}
            className="min-h-0 flex-1"
            empty={<p className="px-4 py-6 text-xs text-muted-foreground">No matches.</p>}
            renderRow={(artist) => <ArtistTile artist={artist} />}
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
    </Panel>
  );
}
