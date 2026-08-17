"use client";

import { AudioLines } from "lucide-react";
import Image from "next/image";

import { VisMenu } from "@/components/panels/vis-menu";
import type { Artist, Visualisation } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Stand-in artwork until thumbnails exist — stable per id, so tiles don't flicker. */
function posterStyle(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  const hue = Math.abs(hash) % 360;
  return {
    backgroundImage: `linear-gradient(135deg, oklch(0.45 0.14 ${hue}), oklch(0.2 0.06 ${(hue + 60) % 360}))`,
  };
}

function formatCount(value: number): string {
  if (value < 1000) return String(value);
  if (value < 1_000_000) return `${(value / 1000).toFixed(value < 10_000 ? 1 : 0)}k`;
  return `${(value / 1_000_000).toFixed(1)}m`;
}

interface VisTileProps {
  vis: Visualisation;
  active: boolean;
  onSelect: () => void;
  /** Drives the owner-only menu entries. */
  owned: boolean;
  onChanged: () => void;
}

/** E3.6 — fixed height, 16:9 thumb, badge right-aligned to the artist name. */
export function VisTile({ vis, active, onSelect, owned, onChanged }: VisTileProps) {
  return (
    // A row rather than a button: the menu trigger is a sibling, because a
    // button cannot legally contain another button.
    <div
      className={cn(
        "group flex w-full items-center gap-3 pl-4 pr-2 transition",
        "hover:bg-foreground/5",
        active && "bg-foreground/10",
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        className="flex min-w-0 flex-1 items-center gap-3 py-2 text-left"
      >
        <div
        className="relative aspect-video h-12 shrink-0 overflow-hidden rounded-md"
        style={posterStyle(vis.id)}
        aria-hidden
      >
        {vis.thumbUrl && (
          <Image
            src={vis.thumbUrl}
            alt=""
            width={160}
            height={90}
            // The gradient underneath stays visible until this loads, so a tile
            // never flashes empty.
            className="h-full w-full object-cover"
            unoptimized={false}
          />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{vis.title}</p>
        <div className="flex items-center gap-2">
          <p className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
            {/* Own work is listed under a visibility label rather than the
                viewer's own name, which tells them nothing. */}
            {vis.visibility && vis.visibility !== "public" ? (
              <span className="rounded-sm bg-foreground/10 px-1 py-0.5 uppercase tracking-wide">
                {vis.visibility}
              </span>
            ) : (
              vis.artist.displayName
            )}
          </p>
          {vis.usesAudio && (
            <span
              // Static and tooltip-only by design — it must never expand and
              // change the tile's height.
              title="Reacts to audio"
              aria-label="Reacts to audio"
              className="shrink-0 text-muted-foreground"
            >
              <AudioLines className="h-3.5 w-3.5" />
            </span>
          )}
        </div>
        </div>
      </button>

      <VisMenu vis={vis} owned={owned} onChanged={onChanged} />
    </div>
  );
}

/** E3.7 — avatar, name, artwork count, total views. */
export function ArtistTile({ artist }: { artist: Artist }) {
  return (
    <a
      href={`/artist/${artist.username}`}
      className="flex w-full items-center gap-3 px-4 py-2 transition hover:bg-foreground/5"
    >
      <div
        className="h-10 w-10 shrink-0 rounded-full"
        style={posterStyle(artist.username)}
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{artist.displayName}</p>
        <p className="truncate text-xs text-muted-foreground">
          {artist.visCount} visualisations · {formatCount(artist.totalViews)} views
        </p>
      </div>
    </a>
  );
}
