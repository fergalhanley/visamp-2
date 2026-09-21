"use client";
import { useEffect, useRef, useState } from "react";
import type { TransportController } from "@/components/chrome/transport";
import type { PlayerMode, Visualisation } from "@/lib/types";
import type { HostedTrackSummary } from "@/lib/hosted-audio/types";
import type { MediaRef } from "@/lib/sets/model";
import { schedule } from "@/lib/sets/scheduler";
import type { Performance } from "./performance-view";

export const visualRef = (vis: Visualisation): MediaRef => ({
  id: vis.id,
  kind: "visual",
  source: "visual",
  title: vis.title,
  attribution: vis.creator.username,
});
export const hostedRef = (track: HostedTrackSummary): MediaRef => ({
  id: track.id,
  kind: "audio",
  source: "hosted",
  title: track.title,
  attribution: track.artist,
  durationMs: track.durationMs,
});
export function nextMedia(
  items: MediaRef[],
  id: string | undefined,
  direction: 1 | -1,
  shuffle: boolean,
) {
  if (!items.length) return undefined;
  const index = items.findIndex((item) => item.id === id);
  if (shuffle && items.length > 1) {
    const others = items.filter((item) => item.id !== id);
    return others[Math.floor(Math.random() * others.length)];
  }
  return items[(index + direction + items.length) % items.length];
}

/** Player-style freeplay choices drive the same VJ transport in either output realm. */
export function useFreeplay(p: Performance, enabled: boolean) {
  const [mode, setMode] = useState<PlayerMode>("track-audio");
  const [intervalSec, setIntervalSec] = useState(30);
  const [shuffleTracks, setShuffleTracks] = useState(false);
  const [shuffleVis, setShuffleVis] = useState(false);
  const [queues, setQueues] = useState({
    audio: [] as MediaRef[],
    visual: [] as MediaRef[],
  });
  const attemptedBoundary = useRef("");
  const state = p.state;
  const scheduled = schedule(state.set, state.positionMs);
  const audio = state.audioOverride?.media ?? scheduled.audio[0]?.clip.media;
  const visual = state.visualOverride?.media ?? scheduled.visual[0]?.clip.media;
  async function select(
    kind: "audio" | "visual",
    media: MediaRef,
    context: MediaRef[],
  ) {
    setQueues((old) => ({ ...old, [kind]: context }));
    await p.override(kind, media);
  }
  async function advance(direction: 1 | -1, onlyVisual = false) {
    const nextAudio = nextMedia(
      queues.audio,
      audio?.id,
      direction,
      shuffleTracks,
    );
    const nextVisual = nextMedia(
      queues.visual,
      visual?.id,
      direction,
      shuffleVis,
    );
    await Promise.all([
      !onlyVisual && nextAudio
        ? p.override("audio", nextAudio)
        : Promise.resolve(),
      (onlyVisual || mode === "track-audio") && nextVisual
        ? p.override("visual", nextVisual)
        : Promise.resolve(),
    ]);
  }
  useEffect(() => {
    const ended =
      state.audioOverride &&
      audio?.durationMs &&
      state.audioOverride.positionMs >= audio.durationMs;
    const timed =
      mode === "time-interval" &&
      state.visualOverride &&
      state.visualOverride.positionMs >= intervalSec * 1000;
    const boundary =
      !enabled || !state.playing
        ? ""
        : ended
          ? `audio:${audio?.id}`
          : timed
            ? `visual:${visual?.id}`
            : "";
    if (!boundary) {
      attemptedBoundary.current = "";
      return;
    }
    if (attemptedBoundary.current === boundary) return;
    attemptedBoundary.current = boundary;
    // Output audio-clock telemetry drives advancement, including while popped out.
    // One attempt per boundary also avoids indefinitely retrying unavailable content.
    void advance(1, !ended);
  });
  const positionMs =
    state.audioOverride?.positionMs ?? scheduled.audio[0]?.sourceMs ?? 0;
  const controller: TransportController = {
    title: visual?.title ?? "Choose a visualisation",
    creator: visual?.attribution ?? "",
    track: audio ? { name: audio.title, artist: audio.attribution } : undefined,
    playing: state.playing,
    position: positionMs / 1000,
    duration: (audio?.durationMs ?? 0) / 1000,
    canPlay: !!audio || !!visual,
    canSkip:
      queues.audio.length > 0 ||
      (mode === "track-audio" && queues.visual.length > 0),
    togglePlay: () => p.send({ action: state.playing ? "pause" : "play" }),
    seek: (seconds) => {
      if (state.audioOverride)
        p.send({ action: "seek-audio", value: seconds * 1000 });
      else {
        const clip = scheduled.audio[0]?.clip;
        if (clip)
          p.send({
            action: "seek",
            value: clip.startMs + seconds * 1000 - clip.sourceOffsetMs,
          });
      }
    },
    skip: (direction) => {
      void advance(direction);
    },
    mode,
    setMode,
    intervalSec,
    setIntervalSec,
    shuffleTracks,
    shuffleVis,
    toggleShuffleTracks: () => setShuffleTracks((old) => !old),
    toggleShuffleVis: () => setShuffleVis((old) => !old),
    fullscreen: p.embedded
      ? () => {
          if (document.fullscreenElement)
            void document.exitFullscreen().catch(() => {});
          else
            void document
              .querySelector<HTMLElement>(".vj-performance .set-output")
              ?.requestFullscreen()
              .catch(() => {});
        }
      : undefined,
  };
  return { controller, select };
}
