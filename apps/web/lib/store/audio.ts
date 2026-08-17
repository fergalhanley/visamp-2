"use client";

import { create } from "zustand";

import { getAudioEngine } from "@/lib/audio/audio-engine";
import {
  loadHandles,
  loadTrackNames,
  pickAudioFiles,
  saveHandles,
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
  isPlaying: boolean;
  position: number;
  duration: number;

  /** E4.5 — names remembered from a previous session, awaiting re-add. */
  pendingNames: string[];

  /** Resolved SoundCloud playlist, if one is loaded. */
  soundcloudPlaylist: SoundCloudPlaylistInfo | null;
  soundcloudTracks: Track[];
  soundcloudLoading: boolean;
  soundcloudError: string | null;

  setSilent: () => void;
  enableMic: () => Promise<void>;
  disableMic: () => void;

  loadSoundcloudPlaylist: (url: string) => Promise<void>;
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

export const useAudioStore = create<AudioState>((set, get) => ({
  kind: "silent",
  micError: null,

  tracks: [],
  currentIndex: -1,
  isPlaying: false,
  position: 0,
  duration: 0,

  pendingNames: [],

  soundcloudPlaylist: null,
  soundcloudTracks: [],
  soundcloudLoading: false,
  soundcloudError: null,

  setSilent: () => {
    const engine = getAudioEngine();
    engine.disableMic();
    engine.stopFiles();
    set({ kind: "silent", isPlaying: false, currentIndex: -1, position: 0 });
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

  loadSoundcloudPlaylist: async (url) => {
    set({ soundcloudLoading: true, soundcloudError: null });

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

      set({
        soundcloudPlaylist: {
          title: data.title ?? "SoundCloud playlist",
          permalinkUrl: data.permalinkUrl ?? null,
          unplayable: data.unplayable ?? 0,
        },
        soundcloudTracks: tracks,
        soundcloudLoading: false,
        kind: "soundcloud",
        currentIndex: -1,
        isPlaying: false,
      });
    } catch (error) {
      set({
        soundcloudLoading: false,
        soundcloudError:
          error instanceof Error ? error.message : "Could not load that playlist",
      });
    }
  },

  clearSoundcloud: () => {
    getAudioEngine().stopFiles();
    set({
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
    set({ kind: "soundcloud", currentIndex: -1, isPlaying: false, position: 0 });
  },

  selectFilesSource: () => {
    getAudioEngine().disableMic();
    getAudioEngine().stopFiles();
    set({ kind: "files", currentIndex: -1, isPlaying: false, position: 0 });
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

    try {
      if (track.source === "soundcloud" && track.soundcloudId) {
        // The signed CDN URL is fetched per play rather than up front: they
        // expire after roughly two hours, and a long queue would go stale.
        const response = await fetch(`/api/soundcloud/stream/${track.soundcloudId}`);
        const data = (await response.json()) as { url?: string; error?: string };

        if (!response.ok || !data.url) {
          throw new Error(data.error ?? "That track could not be streamed");
        }

        await engine.playHlsStream(data.url);
        set({
          kind: "soundcloud",
          currentIndex: index,
          isPlaying: true,
          soundcloudError: null,
        });
        return;
      }

      if (track.file) {
        await engine.playFile(track.file);
        set({ kind: "files", currentIndex: index, isPlaying: true });
      }
    } catch (error) {
      set({
        isPlaying: false,
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
