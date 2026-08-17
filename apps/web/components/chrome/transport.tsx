"use client";

import { Pause, Play, SkipBack, SkipForward } from "lucide-react";

import { useCompactChrome } from "@/hooks/use-compact-chrome";
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
  const isPlaying = useAudioStore((s) => s.isPlaying);
  const position = useAudioStore((s) => s.position);
  const duration = useAudioStore((s) => s.duration);
  const togglePlay = useAudioStore((s) => s.togglePlay);
  const seek = useAudioStore((s) => s.seek);

  const mode = useSessionStore((s) => s.mode);

  const track = tracks[currentIndex];
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
        "fixed bottom-[10vh] left-1/2 z-40 w-[min(30rem,calc(100vw-3rem))] -translate-x-1/2",
        "transition-opacity duration-500",
        visible && !eclipsed ? "opacity-100" : "pointer-events-none opacity-0",
      )}
    >
      <div className="visamp-surface rounded-2xl border px-5 py-3">
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
            aria-label={isPlaying ? "Pause" : "Play"}
            disabled={!hasTracks}
            onClick={() => void togglePlay()}
            className={cn(
              "flex h-11 w-11 items-center justify-center rounded-full",
              "border bg-foreground/5 transition hover:bg-foreground/10",
              "disabled:opacity-30",
            )}
          >
            {isPlaying ? (
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
