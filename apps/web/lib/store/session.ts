"use client";

import { create } from "zustand";

import { DEFAULT_VISUALISATION } from "@/lib/dsl/default";
import { VISUALISATIONS } from "@/lib/fixtures/visualisations";
import type { PlayerMode, Visualisation } from "@/lib/types";

interface SessionState {
  current: Visualisation;
  /**
   * True once something has deliberately chosen what is playing — a route, a
   * server seed, or a click in the V panel.
   *
   * The browse list arrives after first paint, and it must not shove aside a
   * choice the viewer or the URL has already made.
   */
  chosen: boolean;
  /** The list next/prev advance through (E3.10). */
  context: Visualisation[];

  mode: PlayerMode;
  intervalSec: number;
  shuffleVis: boolean;
  shuffleTracks: boolean;

  /** Pick a visualisation, optionally re-setting the playing context. */
  select: (vis: Visualisation, context?: Visualisation[]) => void;
  /**
   * Hand over the browse list once it loads, so next/prev walk what the V
   * panel shows. Only claims `current` if nothing has been chosen yet.
   */
  seedFromBrowse: (items: Visualisation[]) => void;
  advance: (direction: 1 | -1) => void;
  /**
   * Show one more view against a visualisation, wherever it appears in the
   * session. The database is the record; this only keeps the number on screen
   * from being one behind what was just counted.
   */
  countView: (id: string) => void;
  /**
   * Move a like count by one, wherever that visualisation appears. Called
   * straight off the click so the number answers immediately; the row write is
   * what makes it true, and a failure puts it back.
   */
  countLike: (id: string, delta: 1 | -1) => void;
  /** As `countLike`, for a comment posted or removed. */
  countComment: (id: string, delta: 1 | -1) => void;

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
  // The built-in default until something is chosen, so the canvas is never
  // blank — the engine draws nothing of its own any more.
  current: DEFAULT_VISUALISATION,
  chosen: false,
  context: VISUALISATIONS,

  mode: "manual",
  intervalSec: 30,
  shuffleVis: false,
  shuffleTracks: false,

  select: (vis, context) =>
    set((state) => ({
      current: vis,
      chosen: true,
      context: context ?? state.context,
    })),

  seedFromBrowse: (items) =>
    set((state) => {
      if (items.length === 0) return state;
      return {
        context: items,
        current: state.chosen ? state.current : items[0]!,
      };
    }),

  advance: (direction) => {
    const { context, current, shuffleVis } = get();
    const next = pickNext(context, current, direction, shuffleVis);
    if (next.id !== current.id) set({ current: next });
  },

  countView: (id) =>
    set((state) => ({
      current:
        state.current.id === id
          ? { ...state.current, viewCount: state.current.viewCount + 1 }
          : state.current,
      // The same visualisation is usually in the browse list too, and the V
      // panel reads its count from there.
      context: state.context.map((vis) =>
        vis.id === id ? { ...vis, viewCount: vis.viewCount + 1 } : vis,
      ),
    })),

  countLike: (id, delta) =>
    set((state) => {
      const apply = (vis: Visualisation): Visualisation =>
        vis.id === id
          ? { ...vis, likeCount: Math.max(vis.likeCount + delta, 0) }
          : vis;

      return {
        current: apply(state.current),
        context: state.context.map(apply),
      };
    }),

  countComment: (id, delta) =>
    set((state) => {
      const apply = (vis: Visualisation): Visualisation =>
        vis.id === id
          ? { ...vis, commentCount: Math.max(vis.commentCount + delta, 0) }
          : vis;

      return {
        current: apply(state.current),
        context: state.context.map(apply),
      };
    }),

  setMode: (mode) => set({ mode }),
  setIntervalSec: (intervalSec) => set({ intervalSec }),
  toggleShuffleVis: () => set((s) => ({ shuffleVis: !s.shuffleVis })),
  toggleShuffleTracks: () => set((s) => ({ shuffleTracks: !s.shuffleTracks })),
}));
