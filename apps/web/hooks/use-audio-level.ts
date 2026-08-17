"use client";

import { useEffect, useState } from "react";

import { getAudioEngine } from "@/lib/audio/audio-engine";

/**
 * Samples the analyser on an animation frame. Only mount this while the meter
 * is actually on screen — there is no reason to run a rAF loop for a widget
 * nobody can see.
 */
export function useAudioLevel(active: boolean): number {
  const [level, setLevel] = useState(0);

  useEffect(() => {
    if (!active) return;

    let frame = 0;
    const sample = () => {
      setLevel(getAudioEngine().getLevel());
      frame = requestAnimationFrame(sample);
    };
    frame = requestAnimationFrame(sample);

    return () => cancelAnimationFrame(frame);
  }, [active]);

  // Derived rather than reset in the effect, so going inactive doesn't cost a
  // render just to zero the meter.
  return active ? level : 0;
}
