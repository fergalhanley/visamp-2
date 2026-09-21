"use client";

import { useRef, useState } from "react";
import type { AudioPanelLibrary } from "@/components/panels/a-panel";
import type { Track, SoundCloudPlaylistInfo } from "@/lib/types";
import type { MediaRef } from "@/lib/sets/model";
import { fileRef, request } from "@/lib/sets/client";

/** Browsing never creates an audio engine; only the authoritative VJ output plays. */
export function useVjAudioLibrary(
  select: (media: MediaRef) => Promise<void>,
  active: MediaRef | undefined,
  playing: boolean,
) {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [scTracks, setScTracks] = useState<Track[]>([]);
  const [playlist, setPlaylist] = useState<SoundCloudPlaylistInfo | null>(null);
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<"files" | "soundcloud">("files");
  const loadSequence = useRef(0);
  const references = useRef(new Map<string, MediaRef>());
  async function loadPlaylist(link: string) {
    const sequence = ++loadSequence.current;
    setLoading(true);
    setError(null);
    try {
      const data = await request<{
        title?: string;
        permalinkUrl?: string;
        unplayable?: number;
        tracks: {
          id: number;
          title: string;
          artist: string;
          durationMs: number;
        }[];
      }>("/api/soundcloud/resolve", "POST", { url: link });
      if (sequence !== loadSequence.current) return;
      setScTracks(
        data.tracks.map((t) => ({
          id: String(t.id),
          name: t.title,
          source: "soundcloud",
          soundcloudId: t.id,
          artist: t.artist,
          durationMs: t.durationMs,
        })),
      );
      setPlaylist({
        title: data.title ?? "SoundCloud playlist",
        permalinkUrl: data.permalinkUrl ?? null,
        unplayable: data.unplayable ?? 0,
      });
      setSource("soundcloud");
    } catch (e) {
      if (sequence === loadSequence.current) setError(String(e));
    } finally {
      if (sequence === loadSequence.current) setLoading(false);
    }
  }
  const library: AudioPanelLibrary = {
    kind:
      active?.source === "file"
        ? "files"
        : active?.source === "soundcloud"
          ? "soundcloud"
          : "hosted",
    micError: null,
    pendingNames: [],
    pendingIndex: -1,
    tracks,
    soundcloudTracks: scTracks,
    soundcloudPlaylist: playlist,
    soundcloudUrl: url,
    soundcloudLoading: loading,
    soundcloudError: error,
    currentIndex: (active?.source === "soundcloud"
      ? scTracks
      : tracks
    ).findIndex((t) => t.id === active?.id),
    isPlaying: playing,
    enableMic: async () => {},
    disableMic: () => {},
    setSoundcloudUrl: setUrl,
    loadSoundcloudPlaylist: loadPlaylist,
    refreshSoundcloud: () => loadPlaylist(url),
    clearSoundcloud: () => {
      loadSequence.current++;
      setLoading(false);
      setScTracks([]);
      setPlaylist(null);
      setError(null);
    },
    selectSoundcloudSource: () => setSource("soundcloud"),
    selectFilesSource: () => setSource("files"),
    addFiles: (files) => {
      void (async () => {
        try {
          setError(null);
          const refs = await Promise.all(files.map(fileRef));
          for (const ref of refs) references.current.set(ref.id, ref);
          setTracks((old) => [
            ...new Map(
              [
                ...old,
                ...refs.map((m): Track => ({
                  id: m.id,
                  name: m.title,
                  source: "file",
                  durationMs: m.durationMs,
                })),
              ].map((t) => [t.id, t]),
            ).values(),
          ]);
          setSource("files");
          if (refs[0]) await select(refs[0]);
        } catch (e) {
          setError(String(e));
        }
      })();
    },
    addViaPicker: async () => {},
    removeTrack: (id) => setTracks((old) => old.filter((t) => t.id !== id)),
    clearTracks: () => setTracks([]),
    moveTrack: (from, to) =>
      setTracks((old) => {
        if (to < 0 || to >= old.length) return old;
        const next = [...old],
          [item] = next.splice(from, 1);
        if (item) next.splice(to, 0, item);
        return next;
      }),
    playIndex: async (index) => {
      const t = (source === "soundcloud" ? scTracks : tracks)[index];
      if (!t) return;
      const media =
        source === "soundcloud"
          ? {
              id: t.id,
              kind: "audio" as const,
              source: "soundcloud" as const,
              title: t.name,
              attribution: t.artist ?? "SoundCloud",
              durationMs: t.durationMs,
            }
          : references.current.get(t.id);
      if (media) await select(media);
    },
  };
  return { library, error };
}
