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
import type { AudioSourceKind, SoundCloudPlaylistInfo, Track } from "@/lib/types";

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
}): Track[] {
  return state.kind === "soundcloud" ? state.soundcloudTracks : state.tracks;
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

  setSilent: () => void;
  enableMic: () => Promise<void>;
  disableMic: () => void;

  setSoundcloudUrl: (url: string) => void;
  loadSoundcloudPlaylist: (
    url: string,
    options?: { persist?: boolean; autoplay?: boolean; preservePlayback?: boolean },
  ) => Promise<void>;
  /** Re-fetch the current playlist, for when it changed on SoundCloud. */
  refreshSoundcloud: () => Promise<void>;
  clearSoundcloud: () => void;
  selectSoundcloudSource: () => void;
  selectFilesSource: () => void;

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
  "https://soundcloud.com/fergalhanley/sets/vizamp-io";

/**
 * The browser's "no user gesture yet" refusal.
 *
 * Worth telling apart from a real failure: nothing is broken, the page simply
 * has not been touched, and showing an error for it would be a lie.
 */
function isAutoplayBlocked(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === "NotAllowedError") ||
    (error instanceof Error && /gesture|not allowed|interact/i.test(error.message))
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
      if (state.isPlaying || state.currentIndex !== -1 || state.pendingIndex !== -1) {
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

  setSilent: () => {
    const engine = getAudioEngine();
    engine.disableMic();
    engine.stopFiles();
    set({ kind: "silent", isPlaying: false, currentIndex: -1, pendingIndex: -1, position: 0 });
  },

  enableMic: async () => {
    try {
      getAudioEngine().stopFiles();
      await getAudioEngine().enableMic();
      set({ kind: "mic", micError: null, isPlaying: false });
    } catch (error) {
      const message =
        error instanceof DOMException && error.name === "NotAllowedError"
          ? "Microphone permission was denied."
          : "Could not open the microphone.";
      set({ micError: message, kind: "silent" });
    }
  },

  disableMic: () => {
    getAudioEngine().disableMic();
    set({ kind: "silent", micError: null });
  },

  setSoundcloudUrl: (soundcloudUrl) => set({ soundcloudUrl }),

  loadSoundcloudPlaylist: async (url, options) => {
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

      if (!response.ok) throw new Error(data.error ?? "Could not load that playlist");

      const tracks: Track[] = (data.tracks ?? []).map((track) => ({
        id: `sc-${track.id}`,
        name: track.title,
        source: "soundcloud" as const,
        soundcloudId: track.id,
        artist: track.artist,
        durationMs: track.durationMs,
      }));

      // Selecting SoundCloud takes over from the microphone.
      getAudioEngine().disableMic();

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
        const playingId = before.soundcloudTracks[before.currentIndex]?.soundcloudId;
        const stillThere = tracks.findIndex((t) => t.soundcloudId === playingId);

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
      set({
        soundcloudLoading: false,
        soundcloudError:
          error instanceof Error ? error.message : "Could not load that playlist",
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
    getAudioEngine().stopFiles();
    saveSoundcloudUrl("");
    set({
      soundcloudUrl: "",
      soundcloudPlaylist: null,
      soundcloudTracks: [],
      soundcloudError: null,
      kind: "silent",
      currentIndex: -1,
      isPlaying: false,
    });
  },

  selectSoundcloudSource: () => {
    getAudioEngine().disableMic();
    getAudioEngine().stopFiles();
    set({ kind: "soundcloud", currentIndex: -1, pendingIndex: -1, isPlaying: false, position: 0 });
  },

  selectFilesSource: () => {
    getAudioEngine().disableMic();
    getAudioEngine().stopFiles();
    set({ kind: "files", currentIndex: -1, pendingIndex: -1, isPlaying: false, position: 0 });
  },

  addFiles: (files) => {
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
    set({ pendingIndex: index, soundcloudError: null });

    /** False once a newer request has taken over. */
    const current = () => token === playToken;

    try {
      if (track.source === "soundcloud" && track.soundcloudId) {
        // Signed CDN URLs can expire within minutes, so resolve one afresh for
        // every playback and bypass the browser's HTTP cache.
        const response = await fetch(`/api/soundcloud/stream/${track.soundcloudId}`, {
          cache: "no-store",
        });
        const data = (await response.json()) as { url?: string; error?: string };

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

        set({ kind: "files", currentIndex: index, pendingIndex: -1, isPlaying: true });
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
        soundcloudError:
          error instanceof Error ? error.message : "Playback failed",
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
      set({ isPlaying: false });
    } else {
      await getAudioEngine().resume();
      set({ isPlaying: true });
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
  return useAudioStore((s) =>
    s.kind === "soundcloud" ? s.soundcloudTracks : s.tracks,
  );
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
      void useAudioStore.getState().nextTrack();

      // E3.2 — in track-audio mode the visualisation follows the track.
      const session = useSessionStore.getState();
      if (session.mode === "track-audio") session.advance(1);
    },
  });
}
