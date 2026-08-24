"use client";

import {
  Eye,
  GitFork,
  Heart,
  Loader2,
  Maximize,
  MessageCircle,
  Minimize,
  Pause,
  Play,
  Share2,
  SkipBack,
  SkipForward,
} from "lucide-react";
import Link from "next/link";

import { useCompactChrome } from "@/hooks/use-compact-chrome";
import { useFullscreen } from "@/hooks/use-fullscreen";
import { useActiveTracks, useAudioStore } from "@/lib/store/audio";
import { useChromeStore } from "@/lib/store/chrome";
import { useSessionStore } from "@/lib/store/session";
import { cn } from "@/lib/utils";

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const total = Math.floor(seconds);
  const minutes = Math.floor(total / 60);
  return `${minutes}:${String(total % 60).padStart(2, "0")}`;
}

/** E3.3 — a compact marker, because in track-audio mode skip also changes the vis. */
function ModeMarker() {
  const mode = useSessionStore((s) => s.mode);
  const intervalSec = useSessionStore((s) => s.intervalSec);

  const label =
    mode === "track-audio"
      ? "per track"
      : mode === "time-interval"
        ? `every ${intervalSec < 60 ? `${intervalSec}s` : `${intervalSec / 60}m`}`
        : "manual";

  return (
    <span className="rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
      {label}
    </span>
  );
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count !== 1 ? "s" : ""}`;
}

/**
 * E2.6 / E2.7 — views, likes, comments, forks and share.
 *
 * Visible to everyone, signed in or not (principle 5); they gate on click.
 * Previously these hid behind a hover on the title cluster, which made them
 * easy to miss entirely on a touch screen.
 *
 * Views leads the row and is the odd one out: it is a readout, not an action —
 * it counts itself the moment the visualisation starts playing (see
 * `useViewCount`), so there is nothing here to press.
 */
function VisActions() {
  const current = useSessionStore((s) => s.current);

  const actions = [
    { key: "likes", Icon: Heart, label: plural(current.likeCount, "Like") },
    { key: "comments", Icon: MessageCircle, label: plural(current.commentCount, "Comment") },
    { key: "forks", Icon: GitFork, label: plural(current.forkCount, "Fork") },
    { key: "share", Icon: Share2, label: "Share" },
  ];

  return (
    <div className="mt-1.5 flex items-center justify-between gap-4 text-xs text-muted-foreground">
      <span className="flex items-center gap-1">
        <Eye className="h-3.5 w-3.5" />
        {plural(current.viewCount, "View")}
      </span>

      {actions.map(({ key, Icon, label }) => (
        <button
          key={key}
          type="button"
          className="flex cursor-pointer items-center gap-1 transition hover:text-foreground"
        >
          <Icon className="h-3.5 w-3.5" />
          {label}
        </button>
      ))}
    </div>
  );
}

export function Transport() {
  const visible = useChromeStore((s) => s.visible);
  const vOpen = useChromeStore((s) => s.vOpen);
  const aOpen = useChromeStore((s) => s.aOpen);
  const compact = useCompactChrome();

  // A bottom sheet occupies the transport's 10vh perch, so on compact layouts
  // the transport yields while a sheet is up rather than overprinting it.
  const eclipsed = compact && (vOpen || aOpen);

  const tracks = useActiveTracks();
  const currentIndex = useAudioStore((s) => s.currentIndex);
  const pendingIndex = useAudioStore((s) => s.pendingIndex);
  const isPlaying = useAudioStore((s) => s.isPlaying);
  const position = useAudioStore((s) => s.position);
  const duration = useAudioStore((s) => s.duration);
  const togglePlay = useAudioStore((s) => s.togglePlay);
  const seek = useAudioStore((s) => s.seek);

  const mode = useSessionStore((s) => s.mode);
  const current = useSessionStore((s) => s.current);
  const { isFullscreen, toggle: toggleFullscreen } = useFullscreen();

  const loading = pendingIndex !== -1;
  // The track being started wins over the one still playing, so the title
  // changes the instant it is picked rather than after the stream opens.
  const track = tracks[loading ? pendingIndex : currentIndex];
  const hasTracks = tracks.length > 0;
  // In track-audio mode skip is meaningful even with no tracks loaded, because
  // it still advances the visualisation.
  const canSkip = hasTracks || mode === "track-audio";

  const skip = (direction: 1 | -1) => {
    const audio = useAudioStore.getState();
    if (hasTracks) {
      void (direction === 1 ? audio.nextTrack() : audio.prevTrack());
    }
    if (mode === "track-audio") useSessionStore.getState().advance(direction);
  };

  return (
    <div
      className={cn(
        "fixed bottom-[10vh] left-1/2 z-40 w-[min(32rem,calc(100vw-3rem))] -translate-x-1/2",
        "transition-opacity duration-500",
        visible && !eclipsed ? "opacity-100" : "pointer-events-none opacity-0",
      )}
    >
      <div className="visamp-surface rounded-2xl border px-5 py-3">
        {/* What is playing, and the two things you do to a player: go
            fullscreen, or react to the work. */}
        <div className="flex items-start justify-between gap-3">
          <p className="min-w-0 flex-1 truncate text-sm">
            <Link href={`/vis/${current.id}`} className="font-medium hover:underline">
              {current.title}
            </Link>
            <span className="text-muted-foreground"> — </span>
            <Link
              href={`/artist/${current.artist.username}`}
              className="text-muted-foreground hover:underline"
            >
              {current.artist.displayName}
            </Link>
          </p>

          <button
            type="button"
            onClick={toggleFullscreen}
            aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
            className={cn(
              "-mr-1 -mt-1 shrink-0 cursor-pointer rounded-full p-1.5 text-muted-foreground",
              "transition hover:bg-foreground/10 hover:text-foreground",
            )}
          >
            {isFullscreen ? (
              <Minimize className="h-4 w-4" />
            ) : (
              <Maximize className="h-4 w-4" />
            )}
          </button>
        </div>

        <VisActions />

        {/* Inset, so the rule reads as a divider between two halves of one
            card rather than a seam cutting it in two. */}
        <div className="mx-2 my-3 border-t border-foreground/10" />

        <div className="flex items-center justify-center gap-6">
          <button
            type="button"
            aria-label="Previous"
            disabled={!canSkip}
            onClick={() => skip(-1)}
            className="text-muted-foreground transition hover:text-foreground disabled:opacity-30"
          >
            <SkipBack className="h-5 w-5 fill-current" />
          </button>

          <button
            type="button"
            aria-label={loading ? "Loading" : isPlaying ? "Pause" : "Play"}
            // Disabled only while a track is opening: pressing play again
            // mid-load would start whatever is at index 0 instead.
            disabled={!hasTracks || loading}
            onClick={() => void togglePlay()}
            className={cn(
              "flex h-11 w-11 items-center justify-center rounded-full",
              "border bg-foreground/5 transition hover:bg-foreground/10",
              "disabled:opacity-30",
              loading && "disabled:opacity-100",
            )}
          >
            {loading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : isPlaying ? (
              <Pause className="h-5 w-5 fill-current" />
            ) : (
              <Play className="h-5 w-5 translate-x-0.5 fill-current" />
            )}
          </button>

          <button
            type="button"
            aria-label="Next"
            disabled={!canSkip}
            onClick={() => skip(1)}
            className="text-muted-foreground transition hover:text-foreground disabled:opacity-30"
          >
            <SkipForward className="h-5 w-5 fill-current" />
          </button>
        </div>

        <div className="mt-3 flex items-center gap-2">
          <span className="w-9 text-right font-mono text-[10px] text-muted-foreground">
            {formatTime(position)}
          </span>
          <input
            type="range"
            aria-label="Seek"
            min={0}
            max={duration || 0}
            step={0.1}
            value={Math.min(position, duration || 0)}
            disabled={!duration}
            onChange={(event) => seek(Number(event.target.value))}
            className="h-1 flex-1 cursor-pointer appearance-none rounded-full bg-foreground/15 accent-foreground disabled:cursor-default disabled:opacity-40"
          />
          <span className="w-9 font-mono text-[10px] text-muted-foreground">
            {formatTime(duration)}
          </span>
        </div>

        <div className="mt-2 flex items-center justify-center gap-2">
          <p className="truncate text-xs text-muted-foreground">
            {track?.name ?? "Silent — time-driven"}
          </p>
          <ModeMarker />
        </div>
      </div>
    </div>
  );
}
