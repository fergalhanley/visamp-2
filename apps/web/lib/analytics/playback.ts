"use client";
import { useAudioStore } from "@/lib/store/audio";
import { useSessionStore } from "@/lib/store/session";
import { getAudioEngine } from "@/lib/audio/audio-engine";
import { track, analyticsReady } from "./client";
import { ListeningClock } from "./listening";

export function observePlayback() {
  let key = "";
  let session = "";
  let segment = 0;
  let source = "";
  let trackId: string | null = null;
  let clock = new ListeningClock();
  let wasAudible = false;
  const flush = (reason: string) => {
    const seconds = clock.flush();
    if (seconds > 0 && session)
      track("playback_summary", {
        session_id: session,
        source_type: source,
        track_id: trackId,
        listened_seconds: seconds,
        segment: ++segment,
        reason,
      });
  };
  const tick = () => {
    if (!analyticsReady()) {
      clock = new ListeningClock();
      wasAudible = false;
      session = "";
      return;
    }
    const state = useAudioStore.getState();
    const tracks =
      state.kind === "hosted"
        ? state.hostedTracks
        : state.kind === "soundcloud"
          ? state.soundcloudTracks
          : state.tracks;
    const current = tracks[state.currentIndex];
    const nextKey =
      current && state.kind !== "mic" && state.kind !== "silent"
        ? `${state.kind}:${current.id}`
        : "";
    if (key !== nextKey) {
      flush("track_changed");
      key = nextKey;
      session = "";
      segment = 0;
      clock = new ListeningClock();
      wasAudible = false;
      source = state.kind;
      trackId = current?.hostedTrackId ?? null;
    }
    const audible = Boolean(
      key && state.isPlaying && getAudioEngine().isMediaAudible(),
    );
    if (audible && !session) {
      session = crypto.randomUUID();
      track("playback_started", {
        session_id: session,
        source_type: source,
        track_id: trackId,
      });
    }
    const seconds = clock.tick(performance.now(), audible && wasAudible);
    if (wasAudible && !audible) flush("paused");
    else if (seconds >= 30) flush("checkpoint");
    wasAudible = audible;
  };
  const unsubscribeAudio = useAudioStore.subscribe((state, old) => {
    if (state.kind !== old.kind)
      track("audio_source_changed", { previous: old.kind, value: state.kind });
    if (
      (state.hostedError && state.hostedError !== old.hostedError) ||
      (state.soundcloudError && state.soundcloudError !== old.soundcloudError)
    )
      track("playback_failed", {
        source_type: state.kind,
        failure_category: "playback_unavailable",
      });
    tick();
  });
  const unsubscribeMode = useSessionStore.subscribe((state, old) => {
    if (state.mode !== old.mode)
      track("visualisation_mode_changed", {
        previous: old.mode,
        value: state.mode,
      });
  });
  const ended = () => {
    flush("ended");
    session = "";
    segment = 0;
    clock = new ListeningClock();
    wasAudible = false;
  };
  window.addEventListener("visamp:audio-ended", ended);
  const exit = () => {
    tick();
    flush("page_exit");
  };
  const timer = setInterval(tick, 1000);
  window.addEventListener("pagehide", exit);
  tick();
  return () => {
    flush("observer_stopped");
    clearInterval(timer);
    unsubscribeAudio();
    unsubscribeMode();
    window.removeEventListener("pagehide", exit);
    window.removeEventListener("visamp:audio-ended", ended);
  };
}
