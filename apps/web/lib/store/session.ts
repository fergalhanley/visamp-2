"use client";

import { create } from "zustand";

import { DEFAULT_VISUALISATION, VISUALISATIONS } from "@/lib/fixtures/visualisations";
import type { PlayerMode, Visualisation } from "@/lib/types";

interface SessionState {
  /**
   * Flipped by the viewer's first click. Until then no WASM is fetched and no
   * AudioContext exists — see VisampCanvas's `active` prop.
   */
  booted: boolean;
  boot: () => void;

  current: Visualisation;
  /** The list next/prev advance through (E3.10). */
  context: Visualisation[];

  mode: PlayerMode;
  intervalSec: number;
  shuffleVis: boolean;
  shuffleTracks: boolean;

  /** Pick a visualisation, optionally re-setting the playing context. */
  select: (vis: Visualisation, context?: Visualisation[]) => void;
  advance: (direction: 1 | -1) => void;

  setMode: (mode: PlayerMode) => void;
  setIntervalSec: (seconds: number) => void;
  toggleShuffleVis: () => void;
  toggleShuffleTracks: () => void;
}

function pickNext(
  context: Visualisation[],
  current: Visualisation,
  direction: 1 | -1,
  shuffle: boolean,
): Visualisation {
  if (context.length === 0) return current;
  if (context.length === 1) return context[0]!;

  if (shuffle) {
    // Never hand back the visualisation already on screen.
    const others = context.filter((v) => v.id !== current.id);
    return others[Math.floor(Math.random() * others.length)] ?? current;
  }

  const index = context.findIndex((v) => v.id === current.id);
  if (index === -1) return context[0]!;

  const next = (index + direction + context.length) % context.length;
  return context[next]!;
}

export const useSessionStore = create<SessionState>((set, get) => ({
  booted: false,
  boot: () => set({ booted: true }),

  current: DEFAULT_VISUALISATION,
  context: VISUALISATIONS,

  mode: "manual",
  intervalSec: 30,
  shuffleVis: false,
  shuffleTracks: false,

  select: (vis, context) =>
    set((state) => ({
      current: vis,
      context: context ?? state.context,
    })),

  advance: (direction) => {
    const { context, current, shuffleVis } = get();
    const next = pickNext(context, current, direction, shuffleVis);
    if (next.id !== current.id) set({ current: next });
  },

  setMode: (mode) => set({ mode }),
  setIntervalSec: (intervalSec) => set({ intervalSec }),
  toggleShuffleVis: () => set((s) => ({ shuffleVis: !s.shuffleVis })),
  toggleShuffleTracks: () => set((s) => ({ shuffleTracks: !s.shuffleTracks })),
}));
