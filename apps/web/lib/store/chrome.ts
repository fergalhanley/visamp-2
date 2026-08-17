"use client";

import { create } from "zustand";

export type PanelSide = "v" | "a";

interface ChromeState {
  /** E2.2 — chrome is visible only while the cursor is recently active. */
  visible: boolean;
  vOpen: boolean;
  aOpen: boolean;
  /**
   * E2.4a — a panel holding focus in a text input is pinned open, so typing a
   * search query or a comment draft can't be interrupted by the cursor
   * wandering back over the canvas.
   */
  vPinned: boolean;
  aPinned: boolean;

  setVisible: (visible: boolean) => void;
  /**
   * Explicit dismissal — clicking the visualisation itself. Unlike the idle
   * fade this also drops any open panel, including a pinned one, so the chrome
   * goes away all at once rather than leaving a panel stranded on screen.
   */
  hideNow: () => void;
  openPanel: (side: PanelSide) => void;
  closePanel: (side: PanelSide) => void;
  togglePanel: (side: PanelSide) => void;
  setPinned: (side: PanelSide, pinned: boolean) => void;
}

export const useChromeStore = create<ChromeState>((set, get) => ({
  visible: true,
  vOpen: false,
  aOpen: false,
  vPinned: false,
  aPinned: false,

  setVisible: (visible) => set({ visible }),

  hideNow: () =>
    set({
      visible: false,
      vOpen: false,
      aOpen: false,
      vPinned: false,
      aPinned: false,
    }),

  openPanel: (side) => set(side === "v" ? { vOpen: true } : { aOpen: true }),

  closePanel: (side) => {
    const { vPinned, aPinned } = get();
    if (side === "v") {
      if (vPinned) return;
      set({ vOpen: false });
    } else {
      if (aPinned) return;
      set({ aOpen: false });
    }
  },

  togglePanel: (side) =>
    set((s) => (side === "v" ? { vOpen: !s.vOpen } : { aOpen: !s.aOpen })),

  setPinned: (side, pinned) =>
    set(side === "v" ? { vPinned: pinned } : { aPinned: pinned }),
}));

/** Any panel open means the chrome must not fade out from under the cursor. */
export function anyPanelOpen(state: ChromeState): boolean {
  return state.vOpen || state.aOpen;
}
