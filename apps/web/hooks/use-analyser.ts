"use client";

import { useSyncExternalStore } from "react";

import { getAudioEngine } from "@/lib/audio/audio-engine";

/**
 * The live AnalyserNode, or null while nothing is connected.
 *
 * Subscribed rather than derived from the audio source: the node is created on
 * the first gesture that actually needs audio, which does not line up with any
 * store change. Selecting a SoundCloud playlist, for instance, sets the source
 * long before the AudioContext exists — keying off that would leave this null
 * forever.
 */
export function useAnalyser(): AnalyserNode | null {
  return useSyncExternalStore(
    (onChange) => getAudioEngine().onAnalyserChange(onChange),
    () => getAudioEngine().getAnalyser(),
    () => null,
  );
}
