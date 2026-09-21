"use client";

import { useEffect } from "react";
import { useAudioStore, wireAudioEvents } from "@/lib/store/audio";

/** Preview pages own their canvas and must also initialise their audio session. */
export function usePreviewAudio(visId?: string, preferredTrackId?: string | null) {
  useEffect(() => {
    let current = true;
    wireAudioEvents(() => {
      if (!current) return;
      if (visId && preferredTrackId) {
        void useAudioStore.getState().applyPreferredTrack(visId, preferredTrackId, () => current);
      } else {
        void useAudioStore.getState().nextTrack();
      }
    });
    void useAudioStore.getState().restore(preferredTrackId ?? null).then(() => {
      if (current && visId && preferredTrackId) {
        void useAudioStore.getState().applyPreferredTrack(visId, preferredTrackId, () => current);
      }
    });
    return () => { current = false; };
  }, [visId, preferredTrackId]);
}
