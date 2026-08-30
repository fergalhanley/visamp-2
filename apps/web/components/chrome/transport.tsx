"use client";

import {
  CornerUpLeft,
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
  Shuffle,
  SkipBack,
  SkipForward,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { SignInDialog } from "@/components/auth/sign-in-dialog";
import { CommentsDialog } from "@/components/panels/comments-dialog";
import { ForksDialog } from "@/components/panels/forks-dialog";
import { ShareDialog } from "@/components/panels/share-dialog";
import { useCompactChrome } from "@/hooks/use-compact-chrome";
import { useParentVis } from "@/hooks/use-forks";
import { useFullscreen } from "@/hooks/use-fullscreen";
import { useVisLike } from "@/hooks/use-vis-like";
import { useActiveTracks, useAudioStore } from "@/lib/store/audio";
import { useChromeStore } from "@/lib/store/chrome";
import { useSessionStore } from "@/lib/store/session";
import { INTERVAL_CHOICES, type PlayerMode } from "@/lib/types";
import { cn } from "@/lib/utils";

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const total = Math.floor(seconds);
  const minutes = Math.floor(total / 60);
  return `${minutes}:${String(total % 60).padStart(2, "0")}`;
}

const MODES: { value: PlayerMode; label: string }[] = [
  { value: "track-audio", label: "Per track" },
  { value: "time-interval", label: "Timed" },
  { value: "manual", label: "Manual" },
];

function formatInterval(seconds: number): string {
  return seconds < 60 ? `${seconds}s` : `${seconds / 60}m`;
}

/** Visualisation tracking belongs with playback because it governs advancing. */
function PlaybackOptions() {
  const mode = useSessionStore((s) => s.mode);
  const setMode = useSessionStore((s) => s.setMode);
  const intervalSec = useSessionStore((s) => s.intervalSec);
  const setIntervalSec = useSessionStore((s) => s.setIntervalSec);
  const shuffleTracks = useSessionStore((s) => s.shuffleTracks);
  const toggleShuffleTracks = useSessionStore((s) => s.toggleShuffleTracks);
  const shuffleVis = useSessionStore((s) => s.shuffleVis);
  const toggleShuffleVis = useSessionStore((s) => s.toggleShuffleVis);

  return (
    <div className="mt-2 flex items-center justify-end gap-1.5">
      <button
        type="button"
        onClick={toggleShuffleTracks}
        aria-pressed={shuffleTracks}
        aria-label="Shuffle audio tracks"
        title="Shuffle audio tracks"
        className={cn(
          "flex w-fit shrink-0 items-center gap-1.5 rounded-md border px-2 py-1.5 text-[10px] transition",
          shuffleTracks
            ? "border-foreground/30 bg-foreground/10 text-foreground"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        <Shuffle className="h-3.5 w-3.5" />
        Shuffle Audio Tracks
      </button>
      <button
        type="button"
        onClick={toggleShuffleVis}
        aria-pressed={shuffleVis}
        className={cn(
          "flex shrink-0 items-center gap-1.5 rounded-md border px-2 py-1.5 text-[10px] transition",
          shuffleVis
            ? "border-foreground/30 bg-foreground/10 text-foreground"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        <Shuffle className="h-3.5 w-3.5" />
        Shuffle Visualisations
      </button>
      <div className="flex min-w-0 items-center gap-1.5">
        <div className="flex rounded-md bg-foreground/5 p-0.5">
          {MODES.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              onClick={() => setMode(value)}
              className={cn(
                "whitespace-nowrap rounded px-2 py-1 text-[10px] transition",
                mode === value
                  ? "bg-foreground/15 font-medium"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {mode === "time-interval" && (
          <select
            aria-label="Visualisation change interval"
            title="Visualisation change interval"
            value={intervalSec}
            onChange={(event) => setIntervalSec(Number(event.target.value))}
            className="rounded-md border bg-transparent px-1.5 py-1 text-[10px]"
          >
            {INTERVAL_CHOICES.map((seconds) => (
              <option key={seconds} value={seconds}>
                {formatInterval(seconds)}
              </option>
            ))}
          </select>
        )}
      </div>
    </div>
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
 * Counts and actions are deliberately not the same control. Views is a pure
 * readout — it counts itself when the visualisation starts playing (see
 * `useViewCount`). Likes is split: the heart toggles, the number beside it only
 * reports what the heart did.
 */
function VisActions() {
  const current = useSessionStore((s) => s.current);
  const { liked, likeable, toggle, signInOpen, setSignInOpen } = useVisLike();
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [forksOpen, setForksOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const select = useSessionStore((s) => s.select);

  // Null unless this one was forked from something still readable, so the link
  // is simply absent rather than present and dead.
  const parent = useParentVis(current.forkedFromId);

  // These need a row behind them: the built-in default and the fixtures have
  // nothing to hang a like, a comment or a fork on.
  const saved = Boolean(current.ownerId);

  return (
    <div className="mt-1.5 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs text-muted-foreground">
      <span className="flex items-center gap-1">
        <Eye className="h-3.5 w-3.5" />
        {plural(current.viewCount, "View")}
      </span>

      {/* The heart is the only thing here that acts. Its count sits beside it
          as plain text: pressing a number to like something reads as a link to
          a list of who did, which is not what this is. */}
      <span className="flex items-center gap-1">
        <button
          type="button"
          onClick={toggle}
          disabled={!likeable}
          aria-pressed={liked}
          aria-label={liked ? `Unlike ${current.title}` : `Like ${current.title}`}
          title={
            likeable
              ? liked
                ? "Unlike"
                : "Like"
              : "Nothing to like — this one is not saved"
          }
          className={cn(
            "-m-1 cursor-pointer rounded-full p-1 transition",
            "hover:text-foreground disabled:cursor-default disabled:opacity-40",
            liked && "text-red-500 hover:text-red-400",
          )}
        >
          <Heart className={cn("h-3.5 w-3.5", liked && "fill-current")} />
        </button>
        {plural(current.likeCount, "Like")}
      </span>

      {/* Icon and count are one control here, unlike the heart: both halves say
          the same thing — open the thread. */}
      <button
        type="button"
        onClick={() => setCommentsOpen(true)}
        disabled={!saved}
        title={saved ? "Read and add comments" : "No comments — this one is not saved"}
        className={cn(
          "flex cursor-pointer items-center gap-1 transition",
          "hover:text-foreground disabled:cursor-default disabled:opacity-40",
        )}
      >
        <MessageCircle className="h-3.5 w-3.5" />
        {plural(current.commentCount, "Comment")}
      </button>

      <button
        type="button"
        onClick={() => setForksOpen(true)}
        disabled={!saved}
        title={saved ? "See what has been made from this" : "No forks — this one is not saved"}
        className={cn(
          "flex cursor-pointer items-center gap-1 transition",
          "hover:text-foreground disabled:cursor-default disabled:opacity-40",
        )}
      >
        <GitFork className="h-3.5 w-3.5" />
        {plural(current.forkCount, "Fork")}
      </button>

      {/* Only where there is one to go to. The hover names it, because "Parent"
          alone says a fork exists without saying of what. */}
      {parent && (
        <button
          type="button"
          onClick={() => select(parent)}
          title={`Forked from ${parent.title} by ${parent.artist.displayName}`}
          className="flex cursor-pointer items-center gap-1 transition hover:text-foreground"
        >
          <CornerUpLeft className="h-3.5 w-3.5" />
          Parent
        </button>
      )}

      <button
        type="button"
        onClick={() => setShareOpen(true)}
        disabled={!saved}
        title={saved ? "Share this visualisation" : "Nothing to link to — this one is not saved"}
        className={cn(
          "flex cursor-pointer items-center gap-1 transition",
          "hover:text-foreground disabled:cursor-default disabled:opacity-40",
        )}
      >
        <Share2 className="h-3.5 w-3.5" />
        Share
      </button>

      {/* Keyed so the thread — and any draft waiting in the box — belongs to
          whatever is playing now. */}
      <CommentsDialog
        key={current.id}
        vis={current}
        open={commentsOpen}
        onOpenChange={setCommentsOpen}
      />

      <ForksDialog vis={current} open={forksOpen} onOpenChange={setForksOpen} />

      <ShareDialog vis={current} open={shareOpen} onOpenChange={setShareOpen} />

      <SignInDialog open={signInOpen} onOpenChange={setSignInOpen} next="/" />
    </div>
  );
}

export function Transport() {
  const visible = useChromeStore((s) => s.visible);
  const vOpen = useChromeStore((s) => s.vOpen);
  const aOpen = useChromeStore((s) => s.aOpen);
  const setTransportHovered = useChromeStore((s) => s.setTransportHovered);
  const compact = useCompactChrome();

  useEffect(
    () => () => setTransportHovered(false),
    [setTransportHovered],
  );

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
      onPointerEnter={() => setTransportHovered(true)}
      onPointerLeave={() => setTransportHovered(false)}
      className={cn(
        "fixed bottom-[10vh] left-1/2 z-40 w-[min(42rem,calc(100vw-3rem))] -translate-x-1/2",
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
            {/* The gallery owns its own canvas, so enter it with a fresh
                document and preselect this artist from the URL. */}
            <a
              href={`/artists/${current.artist.username}`}
              className="text-muted-foreground hover:underline"
            >
              {current.artist.displayName}
            </a>
          </p>

          <div className="-mr-1 -mt-1 flex shrink-0 items-center gap-1.5">

            <button
              type="button"
              onClick={toggleFullscreen}
              aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
              className={cn(
                "shrink-0 cursor-pointer rounded-full p-1.5 text-muted-foreground",
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
        </div>

        <PlaybackOptions />

        <div className="flex items-center gap-3">
          <button
            type="button"
            aria-label="Previous"
            disabled={!canSkip}
            onClick={() => skip(-1)}
            className="shrink-0 text-muted-foreground transition hover:text-foreground disabled:opacity-30"
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
              "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
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
            className="shrink-0 text-muted-foreground transition hover:text-foreground disabled:opacity-30"
          >
            <SkipForward className="h-5 w-5 fill-current" />
          </button>
          <span className="w-9 text-right font-mono text-[10px] text-muted-foreground">
            {formatTime(position)}
          </span>
          <div className="min-w-0 flex-1">
            <input
              type="range"
              aria-label="Seek"
              min={0}
              max={duration || 0}
              step={0.1}
              value={Math.min(position, duration || 0)}
              disabled={!duration}
              onChange={(event) => seek(Number(event.target.value))}
              className="h-1 w-full min-w-0 cursor-pointer appearance-none rounded-full bg-foreground/15 accent-foreground disabled:cursor-default disabled:opacity-40"
            />
            <p className="mt-[5px] truncate text-center text-xs text-muted-foreground" title={track?.name ?? "Silent — time-driven"}>
              Audio: {track?.name ?? "Silent — time-driven"} {track?.artist ? ` - ${track?.artist}` : ""}
            </p>
          </div>
          <span className="w-9 font-mono text-[10px] text-muted-foreground">
            {formatTime(duration)}
          </span>
        </div>

        {/* Inset, so the rule reads as a divider between two halves of one
            card rather than a seam cutting it in two. */}
        <div className="mx-2 my-3 border-t border-foreground/10" />

        <VisActions />
      </div>
    </div>
  );
}
