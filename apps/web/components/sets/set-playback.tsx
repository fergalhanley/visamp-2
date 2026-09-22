"use client";

import {
  Pause,
  Play,
  Repeat,
  SkipBack,
  SkipForward,
  Square,
  Volume2,
  VolumeX,
} from "lucide-react";
import {
  duration,
  end,
  ordered,
  timecode,
  type SetContent,
} from "@/lib/sets/model";
import { schedule } from "@/lib/sets/scheduler";
import type { Performance } from "./performance-view";

const compactTime = (ms: number) =>
  timecode(ms).slice(0, -4).replace(/^00:/, "");

export function SetProgress({
  set,
  positionMs,
  disabled = false,
  onSeek,
}: {
  set: SetContent;
  positionMs: number;
  disabled?: boolean;
  onSeek: (ms: number) => void;
}) {
  const total = duration(set);
  const position = Math.max(0, Math.min(positionMs, total));
  const seekAt = (element: HTMLDivElement, x: number) => {
    const rect = element.getBoundingClientRect();
    if (!disabled && total && rect.width)
      onSeek(
        Math.round(
          Math.max(0, Math.min(1, (x - rect.left) / rect.width)) * total,
        ),
      );
  };
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-4 text-xs text-muted-foreground">
        <span>
          <span className="text-fuchsia-300">Visualisations</span> /{" "}
          <span className="text-emerald-300">Audio</span>
        </span>
        <span className="font-mono tabular-nums">
          {compactTime(position)} / {compactTime(total)}
        </span>
      </div>
      <div
        role="slider"
        aria-label="Set progress"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={position}
        aria-valuetext={`${timecode(position)} of ${timecode(total)}`}
        aria-disabled={disabled || !total}
        tabIndex={disabled || !total ? -1 : 0}
        className="relative cursor-pointer touch-none overflow-hidden rounded-lg border border-white/15 bg-white/[0.025] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
        onPointerDown={(e) => {
          if (disabled || !total || e.button !== 0) return;
          e.preventDefault();
          e.currentTarget.focus();
          e.currentTarget.setPointerCapture(e.pointerId);
          seekAt(e.currentTarget, e.clientX);
        }}
        onPointerMove={(e) => {
          if (e.currentTarget.hasPointerCapture(e.pointerId))
            seekAt(e.currentTarget, e.clientX);
        }}
        onPointerUp={(e) => {
          if (e.currentTarget.hasPointerCapture(e.pointerId))
            e.currentTarget.releasePointerCapture(e.pointerId);
        }}
        onKeyDown={(e) => {
          if (disabled || !total) return;
          const step = e.shiftKey ? 10000 : 1000;
          const target = {
            ArrowLeft: position - step,
            ArrowDown: position - step,
            ArrowRight: position + step,
            ArrowUp: position + step,
            Home: 0,
            End: total,
          }[e.key];
          if (target !== undefined) {
            e.preventDefault();
            onSeek(Math.max(0, Math.min(total, target)));
          }
        }}
      >
        {(
          [
            ["visual", set.visualClips],
            ["audio", set.audioClips],
          ] as const
        ).map(([kind, clips]) => (
          <div
            key={kind}
            data-lane={kind}
            className="relative h-10 first:border-b first:border-white/15"
            aria-hidden="true"
          >
            {ordered(clips).map((clip) => (
              <div
                key={clip.id}
                data-clip-id={clip.id}
                title={`${clip.media.title} — ${clip.media.attribution} · ${timecode(clip.startMs)}–${timecode(end(clip))}`}
                style={{
                  left: `${total ? (clip.startMs / total) * 100 : 0}%`,
                  width: `${total ? (clip.durationMs / total) * 100 : 0}%`,
                }}
                className={`absolute inset-y-0 flex min-w-0 items-center overflow-hidden border-x border-black/30 px-2 text-xs ${kind === "visual" ? "bg-fuchsia-400/35 text-fuchsia-100" : "bg-emerald-400/30 text-emerald-100"}`}
              >
                <span className="truncate">{clip.media.title}</span>
              </div>
            ))}
          </div>
        ))}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 left-0 bg-white/10"
          style={{ width: `${total ? (position / total) * 100 : 0}%` }}
        />
        <div
          aria-hidden="true"
          data-playhead
          className="pointer-events-none absolute inset-y-0 w-0.5 bg-white shadow-[0_0_6px_#000]"
          style={{
            left: `${total ? (position / total) * 100 : 0}%`,
            transform: "translateX(-50%)",
          }}
        />
      </div>
    </div>
  );
}

export function SetPlayback({
  performance: p,
  disabled,
  onPlay,
  error,
}: {
  performance: Performance;
  disabled: boolean;
  onPlay: () => void;
  error?: string;
}) {
  const s = p.state;
  const scheduled = schedule(s.set, s.positionMs);
  const audio = [...scheduled.audio].sort((a, b) => b.level - a.level)[0];
  const audioClips = ordered(s.set.audioClips);
  const hasSet = duration(s.set) > 0;
  const seek = (value: number) => {
    // Timeline navigation returns to the assigned programme in both output modes.
    if (s.audioOverride) void p.override("audio", null);
    if (s.visualOverride) void p.override("visual", null);
    p.send({ action: "seek", value });
  };
  const previous =
    [...audioClips].reverse().find((c) => c.startMs < s.positionMs - 1)
      ?.startMs ?? 0;
  const next = audioClips.find((c) => c.startMs > s.positionMs + 1)?.startMs;
  const iconButton =
    "flex size-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transition hover:text-foreground disabled:opacity-30 focus-visible:outline-2 focus-visible:outline-white";
  return (
    <section
      aria-label="Set playback"
      className="space-y-5 rounded-xl border border-white/10 bg-black/20 p-4"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="truncate text-base font-medium">
          {hasSet ? s.set.name : "Choose a set to play"}
        </h2>
        <span className="shrink-0 text-xs text-muted-foreground">
          {s.complete ? "Set complete" : p.status}
        </span>
      </div>
      {hasSet && (s.audioOverride || s.visualOverride) && (
        <button
          className="text-xs text-amber-200 underline underline-offset-4"
          disabled={disabled}
          onClick={() => seek(s.positionMs)}
        >
          LIVE OVERRIDE · Return to set
        </button>
      )}
      <SetProgress
        set={s.set}
        positionMs={s.positionMs}
        disabled={disabled}
        onSeek={seek}
      />
      <div className="flex items-center gap-3">
        <button
          aria-label="Previous set track"
          className={iconButton}
          disabled={disabled || !hasSet}
          onClick={() => seek(previous)}
        >
          <SkipBack size={22} fill="currentColor" />
        </button>
        <button
          aria-label={s.playing ? "Pause set" : "Play set"}
          disabled={disabled || !hasSet}
          className="flex size-12 shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/5 hover:bg-white/10 disabled:opacity-30"
          onClick={() => (s.playing ? p.send({ action: "pause" }) : onPlay())}
        >
          {s.playing ? (
            <Pause size={24} fill="currentColor" />
          ) : (
            <Play size={24} fill="currentColor" />
          )}
        </button>
        <button
          aria-label="Next set track"
          className={iconButton}
          disabled={disabled || next === undefined}
          onClick={() => next !== undefined && seek(next)}
        >
          <SkipForward size={22} fill="currentColor" />
        </button>
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="font-mono tabular-nums">
              {compactTime(audio?.sourceMs ?? 0)}
            </span>
            <input
              aria-label="Current set track position"
              type="range"
              min={0}
              max={audio?.clip.durationMs || 1}
              step={10}
              value={audio ? Math.max(0, s.positionMs - audio.clip.startMs) : 0}
              disabled={disabled || !audio}
              className="min-w-0 flex-1 accent-white"
              onChange={(e) =>
                audio && seek(audio.clip.startMs + Number(e.target.value))
              }
            />
            <span className="font-mono tabular-nums">
              {compactTime(
                audio ? audio.clip.sourceOffsetMs + audio.clip.durationMs : 0,
              )}
            </span>
          </div>
          <p className="truncate text-center text-sm text-muted-foreground">
            Audio:{" "}
            {audio
              ? `${audio.clip.media.title}${audio.clip.media.attribution ? ` — ${audio.clip.media.attribution}` : ""}`
              : "Silent — time-driven"}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          aria-label="Stop set"
          className={iconButton}
          disabled={!hasSet}
          onClick={() => p.send({ action: "stop" })}
        >
          <Square size={16} />
        </button>
        <button
          aria-label="Loop set"
          aria-pressed={s.loop}
          className={`${iconButton} ${s.loop ? "!text-fuchsia-300" : ""}`}
          disabled={!hasSet}
          onClick={() => p.send({ action: "loop", value: !s.loop })}
        >
          <Repeat size={18} />
        </button>
        <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
          {scheduled.visual.map((v) => v.clip.media.title).join(" → ") ||
            "No visualisation at this position"}
        </span>
        <button
          aria-label={s.muted ? "Unmute set" : "Mute set"}
          className={iconButton}
          onClick={() => p.send({ action: "mute", value: !s.muted })}
        >
          {s.muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
        </button>
        <input
          aria-label="Set volume"
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={s.volume}
          className="w-20 accent-white"
          onChange={(e) =>
            p.send({ action: "volume", value: Number(e.target.value) })
          }
        />
      </div>
      {error && (
        <p role="alert" className="text-sm text-rose-300">
          {error}
        </p>
      )}
    </section>
  );
}
