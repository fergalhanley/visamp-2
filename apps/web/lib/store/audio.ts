"use client";

import { create } from "zustand";

import { getAudioEngine } from "@/lib/audio/audio-engine";
import {
  loadHandles,
  loadSoundcloudUrl,
  loadTrackNames,
  pickAudioFiles,
  saveHandles,
  saveSoundcloudUrl,
  saveTrackNames,
  supportsFileSystemAccess,
  type FileSystemFileHandleLike,
} from "@/lib/audio/persistence";
import { useSessionStore } from "@/lib/store/session";
import type {
  HostedPlayback,
  HostedTrackSummary,
} from "@/lib/hosted-audio/types";
import type {
  AudioSourceKind,
  SoundCloudPlaylistInfo,
  Track,
} from "@/lib/types";

let trackSeq = 0;
const nextTrackId = () => `track-${(trackSeq += 1)}`;

/**
 * Local files and SoundCloud are kept as separate lists so switching source
 * back and forth doesn't destroy either one. This picks whichever the current
 * source is playing from.
 */
function activeTracks(state: {
  kind: AudioSourceKind;
  tracks: Track[];
  soundcloudTracks: Track[];
  hostedTracks: Track[];
}): Track[] {
  if (state.kind === "soundcloud") return state.soundcloudTracks;
  if (state.kind === "hosted") return state.hostedTracks;
  return state.tracks;
}

interface AudioState {
  /** E4.7 — silent (time-driven) is the default; every vis runs without audio. */
  kind: AudioSourceKind;
  micError: string | null;

  tracks: Track[];
  currentIndex: number;
  /**
   * The track being started, before it actually plays.
   *
   * A SoundCloud track needs a signed URL fetched and a stream opened, which
   * takes long enough to look broken. `currentIndex` only moves once sound is
   * coming out, so without this the list highlights nothing and the transport
   * still names the previous track while the new one loads.
   */
  pendingIndex: number;
  isPlaying: boolean;
  position: number;
  duration: number;

  /** E4.5 — names remembered from a previous session, awaiting re-add. */
  pendingNames: string[];

  /**
   * The playlist link, shared by the player panel and the editor popover so
   * both show the same value and it survives a reload.
   */
  soundcloudUrl: string;
  /** Resolved SoundCloud playlist, if one is loaded. */
  soundcloudPlaylist: SoundCloudPlaylistInfo | null;
  soundcloudTracks: Track[];
  soundcloudLoading: boolean;
  soundcloudError: string | null;

  hostedTracks: Track[];
  hostedLoading: boolean;
  hostedError: string | null;

  setSilent: () => void;
  enableMic: () => Promise<void>;
  disableMic: () => void;

  setSoundcloudUrl: (url: string) => void;
  loadSoundcloudPlaylist: (
    url: string,
    options?: {
      persist?: boolean;
      autoplay?: boolean;
      preservePlayback?: boolean;
    },
  ) => Promise<void>;
  /** Re-fetch the current playlist, for when it changed on SoundCloud. */
  refreshSoundcloud: () => Promise<void>;
  clearSoundcloud: () => void;
  selectSoundcloudSource: () => void;
  selectFilesSource: () => void;
  loadHostedCatalogue: () => Promise<void>;
  selectHostedSource: () => void;

  addFiles: (files: File[]) => void;
  addViaPicker: () => Promise<void>;
  removeTrack: (id: string) => void;
  clearTracks: () => void;
  moveTrack: (from: number, to: number) => void;

  playIndex: (index: number) => Promise<void>;
  togglePlay: () => Promise<void>;
  nextTrack: () => Promise<void>;
  prevTrack: () => Promise<void>;
  seek: (seconds: number) => void;

  restore: () => Promise<void>;
}

/**
 * What plays when a viewer has never chosen anything of their own.
 *
 * Deliberately *not* written to localStorage: only a playlist the viewer
 * actually entered is remembered, so "never chosen" stays distinguishable and
 * changing this default reaches everyone who has not overridden it.
 */
export const DEFAULT_SOUNDCLOUD_PLAYLIST =
  "https://soundcloud.com/visamp_io/sets/vizamp-io";

/**
 * The browser's "no user gesture yet" refusal.
 *
 * Worth telling apart from a real failure: nothing is broken, the page simply
 * has not been touched, and showing an error for it would be a lie.
 */
function isAutoplayBlocked(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === "NotAllowedError") ||
    (error instanceof Error &&
      /gesture|not allowed|interact/i.test(error.message))
  );
}

let waitingForGesture = false;

/**
 * Identifies the most recent play request.
 *
 * Click track 1, then track 5 before the first resolves, and without this the
 * slower response wins — the list ends up highlighting whatever finished last
 * rather than what was asked for.
 */
let playToken = 0;
let soundcloudLoadToken = 0;
let hostedCatalogueToken = 0;
let hostedRenewalTimer: ReturnType<typeof setTimeout> | null = null;
let hostedPlayCountTimer: ReturnType<typeof setTimeout> | null = null;
let hostedRecoveryTrackId: string | null = null;
let hostedPlayCountTrackId: string | null = null;
let hostedPlayedMs = 0;
let hostedLastCountTick = 0;
let hostedPlayCountReported = false;

function cancelHostedTimers(): void {
  if (hostedRenewalTimer) clearTimeout(hostedRenewalTimer);
  if (hostedPlayCountTimer) clearTimeout(hostedPlayCountTimer);
  hostedRenewalTimer = null;
  hostedPlayCountTimer = null;
  hostedPlayCountTrackId = null;
  hostedPlayedMs = 0;
  hostedLastCountTick = 0;
  hostedPlayCountReported = false;
}

function chooseHostedSource(playback: HostedPlayback) {
  const canOpus =
    document.createElement("audio").canPlayType('audio/ogg; codecs="opus"') !==
    "";
  return (
    playback.sources.find(
      (source) => source.format === (canOpus ? "opus" : "aac"),
    ) ?? playback.sources[0]
  );
}

async function fetchHostedPlayback(trackId: string): Promise<HostedPlayback> {
  const response = await fetch(`/api/tracks/${trackId}/playback`, {
    cache: "no-store",
  });
  const data = (await response.json()) as HostedPlayback & { error?: string };
  if (!response.ok || !data.sources?.length) {
    throw new Error(data.error ?? "That hosted track could not be played");
  }
  return data;
}

function armHostedPlayCount(trackId: string): void {
  if (hostedPlayCountTimer) clearTimeout(hostedPlayCountTimer);
  if (hostedPlayCountTrackId !== trackId) {
    hostedPlayCountTrackId = trackId;
    hostedPlayedMs = 0;
    hostedPlayCountReported = false;
  }
  if (hostedPlayCountReported) return;
  hostedLastCountTick = performance.now();

  const tick = () => {
    const state = useAudioStore.getState();
    const current = state.hostedTracks[state.currentIndex];
    if (
      state.kind !== "hosted" ||
      !state.isPlaying ||
      current?.hostedTrackId !== trackId
    ) {
      hostedPlayCountTimer = null;
      return;
    }

    const now = performance.now();
    if (getAudioEngine().isMediaActuallyPlaying()) {
      hostedPlayedMs += now - hostedLastCountTick;
    }
    hostedLastCountTick = now;

    if (hostedPlayedMs >= 5000) {
      hostedPlayCountTimer = null;
      hostedPlayCountReported = true;
      void fetch(`/api/tracks/${trackId}/play`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ context: "vis" }),
      });
      return;
    }
    hostedPlayCountTimer = setTimeout(tick, 250);
  };

  hostedPlayCountTimer = setTimeout(tick, 250);
}

function scheduleHostedRenewal(trackId: string, expiresAt: string): void {
  if (hostedRenewalTimer) clearTimeout(hostedRenewalTimer);
  const delay = Math.max(1000, Date.parse(expiresAt) - Date.now() - 60_000);
  hostedRenewalTimer = setTimeout(() => {
    void renewHostedPlayback(trackId, false);
  }, delay);
}

async function renewHostedPlayback(
  trackId: string,
  recovering: boolean,
): Promise<void> {
  const state = useAudioStore.getState();
  const current = state.hostedTracks[state.currentIndex];
  if (state.kind !== "hosted" || current?.hostedTrackId !== trackId) return;
  if (recovering) {
    if (hostedRecoveryTrackId === trackId) return;
    hostedRecoveryTrackId = trackId;
  }

  try {
    const playback = await fetchHostedPlayback(trackId);
    const source = chooseHostedSource(playback);
    if (!source) throw new Error("No compatible hosted rendition is available");
    const beforeReplace = useAudioStore.getState();
    const beforeTrack = beforeReplace.hostedTracks[beforeReplace.currentIndex];
    if (
      beforeReplace.kind !== "hosted" ||
      beforeTrack?.hostedTrackId !== trackId
    ) return;

    await getAudioEngine().replaceUrl(source.url);
    const afterReplace = useAudioStore.getState();
    const afterTrack = afterReplace.hostedTracks[afterReplace.currentIndex];
    if (
      afterReplace.kind !== "hosted" ||
      afterTrack?.hostedTrackId !== trackId
    ) return;
    scheduleHostedRenewal(trackId, source.expiresAt);
  } catch (error) {
    const latest = useAudioStore.getState();
    const latestTrack = latest.hostedTracks[latest.currentIndex];
    if (
      latest.kind === "hosted" &&
      latestTrack?.hostedTrackId === trackId &&
      !(error instanceof DOMException && error.name === "AbortError")
    ) {
      useAudioStore.setState({
        hostedError:
          error instanceof Error ? error.message : "Hosted playback failed",
        isPlaying: false,
      });
    }
  } finally {
    if (hostedRecoveryTrackId === trackId) hostedRecoveryTrackId = null;
  }
}

/**
 * Starts playback on the first thing the viewer does.
 *
 * Browsers will not begin audio before a gesture, and since the player has no
 * gate in front of it there is no click to hang this on. Arming the first
 * pointer or key event gets as close to "playing on arrival" as the platform
 * permits.
 */
function startOnFirstGesture(): void {
  if (waitingForGesture || typeof window === "undefined") return;
  waitingForGesture = true;

  const begin = () => {
    window.removeEventListener("pointerdown", begin);
    window.removeEventListener("keydown", begin);
    waitingForGesture = false;

    // Deferred so an explicit action — pressing play, picking a track — wins
    // rather than racing this.
    window.setTimeout(() => {
      const state = useAudioStore.getState();
      // `pendingIndex` matters as much as the other two: if the gesture that
      // released this was a click on a track, that track is already starting
      // and nothing is playing yet — without this check the armed default
      // starts the top of the list instead of the one that was clicked.
      if (
        state.isPlaying ||
        state.currentIndex !== -1 ||
        state.pendingIndex !== -1
      ) {
        return;
      }
      void state.playIndex(0);
    }, 0);
  };

  window.addEventListener("pointerdown", begin);
  window.addEventListener("keydown", begin);
}

export const useAudioStore = create<AudioState>((set, get) => ({
  kind: "silent",
  micError: null,

  tracks: [],
  currentIndex: -1,
  pendingIndex: -1,
  isPlaying: false,
  position: 0,
  duration: 0,

  pendingNames: [],

  soundcloudUrl: "",
  soundcloudPlaylist: null,
  soundcloudTracks: [],
  soundcloudLoading: false,
  soundcloudError: null,

  hostedTracks: [],
  hostedLoading: false,
  hostedError: null,

  setSilent: () => {
    playToken += 1;
    cancelHostedTimers();
    const engine = getAudioEngine();
    engine.disableMic();
    engine.stopFiles();
    set({
      kind: "silent",
      isPlaying: false,
      currentIndex: -1,
      pendingIndex: -1,
      position: 0,
    });
  },

  enableMic: async () => {
    const token = (playToken += 1);
    try {
      cancelHostedTimers();
      getAudioEngine().stopFiles();
      await getAudioEngine().enableMic();
      if (token !== playToken) {
        getAudioEngine().disableMic();
        return;
      }
      set({ kind: "mic", micError: null, isPlaying: false });
    } catch (error) {
      if (token !== playToken) return;
      const message =
        error instanceof DOMException && error.name === "NotAllowedError"
          ? "Microphone permission was denied."
          : "Could not open the microphone.";
      set({ micError: message, kind: "silent" });
    }
  },

  disableMic: () => {
    playToken += 1;
    getAudioEngine().disableMic();
    set({ kind: "silent", micError: null });
  },

  setSoundcloudUrl: (soundcloudUrl) => {
    soundcloudLoadToken += 1;
    set({ soundcloudUrl, soundcloudLoading: false });
  },

  loadSoundcloudPlaylist: async (url, options) => {
    const token = (soundcloudLoadToken += 1);
    const current = () => token === soundcloudLoadToken;
    set({ soundcloudUrl: url, soundcloudLoading: true, soundcloudError: null });

    try {
      const response = await fetch("/api/soundcloud/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });

      const data = (await response.json()) as {
        title?: string;
        permalinkUrl?: string | null;
        unplayable?: number;
        tracks?: {
          id: number;
          title: string;
          artist: string;
          durationMs: number;
        }[];
        error?: string;
      };

      if (!response.ok)
        throw new Error(data.error ?? "Could not load that playlist");
      if (!current()) return;

      const tracks: Track[] = (data.tracks ?? []).map((track) => ({
        id: `sc-${track.id}`,
        name: track.title,
        source: "soundcloud" as const,
        soundcloudId: track.id,
        artist: track.artist,
        durationMs: track.durationMs,
      }));

      // A new playlist becomes the active source. A background refresh leaves
      // the current SoundCloud stream untouched.
      getAudioEngine().disableMic();
      if (!options?.preservePlayback) {
        playToken += 1;
        cancelHostedTimers();
        getAudioEngine().stopFiles();
      }

      // Persist only on success, so a typo is never restored next visit — and
      // only what the viewer chose, never the built-in default.
      if (options?.persist !== false) saveSoundcloudUrl(url);

      const playlist = {
        title: data.title ?? "SoundCloud playlist",
        permalinkUrl: data.permalinkUrl ?? null,
        unplayable: data.unplayable ?? 0,
      };

      if (options?.preservePlayback) {
        // A refresh must not interrupt what is playing. The track is followed
        // by id rather than position, because the whole point of refreshing is
        // that the running order may have changed.
        const before = get();
        const playingId =
          before.soundcloudTracks[before.currentIndex]?.soundcloudId;
        const stillThere = tracks.findIndex(
          (t) => t.soundcloudId === playingId,
        );

        set({
          soundcloudPlaylist: playlist,
          soundcloudTracks: tracks,
          soundcloudLoading: false,
          kind: "soundcloud",
          // Removed from the playlist upstream: the audio carries on, it is
          // just no longer a row anyone can point at.
          currentIndex: stillThere,
        });
        return;
      }

      set({
        soundcloudPlaylist: playlist,
        soundcloudTracks: tracks,
        soundcloudLoading: false,
        kind: "soundcloud",
        currentIndex: -1,
        pendingIndex: -1,
        isPlaying: false,
      });

      if (options?.autoplay && tracks.length > 0) {
        await get().playIndex(0);
      }
    } catch (error) {
      if (!current()) return;
      set({
        soundcloudLoading: false,
        soundcloudError:
          error instanceof Error
            ? error.message
            : "Could not load that playlist",
      });
    }
  },

  refreshSoundcloud: async () => {
    const { soundcloudUrl } = get();
    if (!soundcloudUrl) return;

    // Not persisted again: the URL has not changed, and a refresh of the
    // built-in default must not turn it into a saved choice.
    await get().loadSoundcloudPlaylist(soundcloudUrl, {
      persist: false,
      preservePlayback: true,
    });
  },

  clearSoundcloud: () => {
    soundcloudLoadToken += 1;
    playToken += 1;
    getAudioEngine().stopFiles();
    saveSoundcloudUrl("");
    set({
      soundcloudUrl: "",
      soundcloudPlaylist: null,
      soundcloudTracks: [],
      soundcloudLoading: false,
      soundcloudError: null,
      kind: "silent",
      currentIndex: -1,
      isPlaying: false,
    });
  },

  selectSoundcloudSource: () => {
    soundcloudLoadToken += 1;
    playToken += 1;
    cancelHostedTimers();
    getAudioEngine().disableMic();
    getAudioEngine().stopFiles();
    set({
      kind: "soundcloud",
      soundcloudLoading: false,
      currentIndex: -1,
      pendingIndex: -1,
      isPlaying: false,
      position: 0,
    });
  },

  selectFilesSource: () => {
    playToken += 1;
    cancelHostedTimers();
    getAudioEngine().disableMic();
    getAudioEngine().stopFiles();
    set({
      kind: "files",
      currentIndex: -1,
      pendingIndex: -1,
      isPlaying: false,
      position: 0,
    });
  },

  loadHostedCatalogue: async () => {
    const token = (hostedCatalogueToken += 1);
    set({ hostedLoading: true, hostedError: null });
    try {
      const response = await fetch("/api/tracks");
      const data = (await response.json()) as {
        tracks?: HostedTrackSummary[];
        error?: string;
      };
      if (!response.ok)
        throw new Error(data.error ?? "Could not load hosted tracks");
      if (token !== hostedCatalogueToken) return;

      set({
        hostedTracks: (data.tracks ?? []).map((track) => ({
          id: `hosted-${track.id}`,
          name: track.title,
          source: "hosted" as const,
          hostedTrackId: track.id,
          artist: track.artist,
          durationMs: track.durationMs,
        })),
        hostedLoading: false,
      });
    } catch (error) {
      if (token !== hostedCatalogueToken) return;
      set({
        hostedLoading: false,
        hostedError:
          error instanceof Error
            ? error.message
            : "Could not load hosted tracks",
      });
    }
  },

  selectHostedSource: () => {
    playToken += 1;
    cancelHostedTimers();
    getAudioEngine().disableMic();
    getAudioEngine().stopFiles();
    set({
      kind: "hosted",
      currentIndex: -1,
      pendingIndex: -1,
      isPlaying: false,
      position: 0,
      hostedError: null,
    });
  },

  addFiles: (files) => {
    if (get().kind !== "files") {
      playToken += 1;
      cancelHostedTimers();
      getAudioEngine().disableMic();
      getAudioEngine().stopFiles();
    }
    const added: Track[] = files.map((file) => ({
      id: nextTrackId(),
      name: file.name,
      source: "file",
      file,
    }));

    set((state) => {
      const tracks = [...state.tracks, ...added];
      saveTrackNames(tracks.map((t) => t.name));
      return { tracks, kind: "files", pendingNames: [] };
    });
  },

  addViaPicker: async () => {
    if (!supportsFileSystemAccess()) return;

    const handles = await pickAudioFiles();
    if (handles.length === 0) return;

    const files = await Promise.all(handles.map((h) => h.getFile()));
    get().addFiles(files);
    void saveHandles(handles);
  },

  removeTrack: (id) =>
    set((state) => {
      const index = state.tracks.findIndex((t) => t.id === id);
      if (index === -1) return state;

      const tracks = state.tracks.filter((t) => t.id !== id);
      saveTrackNames(tracks.map((t) => t.name));

      // Keep the playhead pointing at the same track where possible.
      let currentIndex = state.currentIndex;
      if (index === currentIndex) currentIndex = -1;
      else if (index < currentIndex) currentIndex -= 1;

      return { tracks, currentIndex };
    }),

  clearTracks: () => {
    playToken += 1;
    getAudioEngine().stopFiles();
    saveTrackNames([]);
    set({
      tracks: [],
      currentIndex: -1,
      isPlaying: false,
      position: 0,
      duration: 0,
      pendingNames: [],
    });
  },

  moveTrack: (from, to) =>
    set((state) => {
      if (from === to) return state;

      const tracks = [...state.tracks];
      const [moved] = tracks.splice(from, 1);
      if (!moved) return state;
      tracks.splice(to, 0, moved);
      saveTrackNames(tracks.map((t) => t.name));

      const current = state.tracks[state.currentIndex];
      const currentIndex = current
        ? tracks.findIndex((t) => t.id === current.id)
        : state.currentIndex;

      return { tracks, currentIndex };
    }),

  playIndex: async (index) => {
    const state = get();
    const track = activeTracks(state)[index];
    if (!track) return;

    const engine = getAudioEngine();

    // Claimed before anything is awaited, so the row highlights and the
    // transport renames the moment it is clicked.
    const token = (playToken += 1);
    cancelHostedTimers();
    hostedRecoveryTrackId = null;
    set({ pendingIndex: index, soundcloudError: null, hostedError: null });

    /** False once a newer request has taken over. */
    const current = () => token === playToken;

    try {
      if (track.source === "hosted" && track.hostedTrackId) {
        const playback = await fetchHostedPlayback(track.hostedTrackId);
        const source = chooseHostedSource(playback);
        if (!source)
          throw new Error("No compatible hosted rendition is available");
        if (!current()) return;

        await engine.playUrl(source.url);
        if (!current()) return;

        set({
          kind: "hosted",
          currentIndex: index,
          pendingIndex: -1,
          isPlaying: true,
          hostedError: null,
        });
        scheduleHostedRenewal(track.hostedTrackId, source.expiresAt);
        armHostedPlayCount(track.hostedTrackId);
        return;
      }

      if (track.source === "soundcloud" && track.soundcloudId) {
        // Signed CDN URLs can expire within minutes, so resolve one afresh for
        // every playback and bypass the browser's HTTP cache.
        const response = await fetch(
          `/api/soundcloud/stream/${track.soundcloudId}`,
          {
            cache: "no-store",
          },
        );
        const data = (await response.json()) as {
          url?: string;
          error?: string;
        };

        if (!response.ok || !data.url) {
          throw new Error(data.error ?? "That track could not be streamed");
        }

        if (!current()) return;

        await engine.playHlsStream(data.url);
        if (!current()) return;

        set({
          kind: "soundcloud",
          currentIndex: index,
          pendingIndex: -1,
          isPlaying: true,
          soundcloudError: null,
        });
        return;
      }

      if (track.file) {
        await engine.playFile(track.file);
        if (!current()) return;

        set({
          kind: "files",
          currentIndex: index,
          pendingIndex: -1,
          isPlaying: true,
        });
      }
    } catch (error) {
      // A superseded request must not clear the newer one's spinner.
      if (!current()) return;

      if (isAutoplayBlocked(error)) {
        // Nothing is wrong: the browser is holding out for a gesture, so wait
        // for one rather than putting a red message in front of the viewer.
        set({ isPlaying: false, pendingIndex: -1 });
        startOnFirstGesture();
        return;
      }

      set({
        isPlaying: false,
        pendingIndex: -1,
        hostedError:
          track.source === "hosted"
            ? error instanceof Error
              ? error.message
              : "Playback failed"
            : null,
        soundcloudError:
          track.source === "soundcloud"
            ? error instanceof Error
              ? error.message
              : "Playback failed"
            : null,
      });
    }
  },

  togglePlay: async () => {
    const state = get();
    const { isPlaying, currentIndex } = state;
    const list = activeTracks(state);

    if (currentIndex === -1) {
      if (list.length > 0) await get().playIndex(0);
      return;
    }

    if (isPlaying) {
      getAudioEngine().pause();
      if (hostedPlayCountTimer) clearTimeout(hostedPlayCountTimer);
      hostedPlayCountTimer = null;
      set({ isPlaying: false });
    } else {
      await getAudioEngine().resume();
      set({ isPlaying: true });
      const track = list[currentIndex];
      if (state.kind === "hosted" && track?.hostedTrackId) {
        armHostedPlayCount(track.hostedTrackId);
      }
    }
  },

  nextTrack: async () => {
    const state = get();
    const list = activeTracks(state);
    if (list.length === 0) return;

    const { shuffleTracks } = useSessionStore.getState();
    const next = shuffleTracks
      ? Math.floor(Math.random() * list.length)
      : (state.currentIndex + 1) % list.length;

    await get().playIndex(next);
  },

  prevTrack: async () => {
    const state = get();
    const list = activeTracks(state);
    if (list.length === 0) return;

    const previous = (state.currentIndex - 1 + list.length) % list.length;
    await get().playIndex(previous);
  },

  seek: (seconds) => {
    getAudioEngine().seek(seconds);
    set({ position: seconds });
  },

  restore: async () => {
    void get().loadHostedCatalogue();
    // Re-resolve the remembered playlist, or fall back to the default. One
    // request either way, and it has to be a fresh one: stored stream URLs
    // would have expired.
    const storedUrl = loadSoundcloudUrl();
    const url = storedUrl || DEFAULT_SOUNDCLOUD_PLAYLIST;

    set({ soundcloudUrl: url });
    void get().loadSoundcloudPlaylist(url, {
      // A viewer's own choice is already saved; the default must not be, or it
      // would masquerade as one.
      persist: Boolean(storedUrl),
      autoplay: true,
    });

    const names = loadTrackNames();

    if (!supportsFileSystemAccess()) {
      set({ pendingNames: names });
      return;
    }

    const { granted, needsPermission } = await loadHandles();
    if (granted.length === 0) {
      set({ pendingNames: names });
      return;
    }

    const files = await Promise.all(
      granted.map((handle: FileSystemFileHandleLike) => handle.getFile()),
    );

    set({
      tracks: files.map((file) => ({
        id: nextTrackId(),
        name: file.name,
        source: "file" as const,
        file,
      })),
      pendingNames: needsPermission.map((h) => h.name),
    });
  },
}));

/** The tracklist the transport is currently driving. */
export function useActiveTracks(): Track[] {
  return useAudioStore((s) => activeTracks(s));
}

/**
 * Bridges the media element's own events back into the store. Called once from
 * the shell.
 */
export function wireAudioEvents(): void {
  getAudioEngine().setEvents({
    onTimeUpdate: (position, duration) =>
      useAudioStore.setState({ position, duration }),
    onEnded: () => {
      cancelHostedTimers();
      void useAudioStore.getState().nextTrack();

      // E3.2 — in track-audio mode the visualisation follows the track.
      const session = useSessionStore.getState();
      if (session.mode === "track-audio") session.advance(1);
    },
    onMediaError: () => {
      const state = useAudioStore.getState();
      if (state.kind !== "hosted") return;
      const track = state.hostedTracks[state.currentIndex];
      if (track?.hostedTrackId)
        void renewHostedPlayback(track.hostedTrackId, true);
    },
  });
}
