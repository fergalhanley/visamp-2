"use client";

import {
  Cloud,
  Loader2,
  Maximize,
  Mic,
  MicOff,
  Minimize,
  Pause,
  Play,
  Plus,
  SkipBack,
  SkipForward,
  Trash2,
  Volume2,
} from "lucide-react";
import { useRef, type RefObject } from "react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useAudioLevel } from "@/hooks/use-audio-level";
import { useSupportsFileSystemAccess } from "@/hooks/use-capabilities";
import { useFullscreen } from "@/hooks/use-fullscreen";
import { useActiveTracks, useAudioStore } from "@/lib/store/audio";
import { cn } from "@/lib/utils";

const ACCEPTED = ".mp3,.m4a,.aac,.ogg,.opus,.wav,.flac";

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const total = Math.floor(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/** The SoundCloud playlist picker, kept in a popover so the bar stays thin. */
function SoundcloudPopover() {
  const playlist = useAudioStore((s) => s.soundcloudPlaylist);
  const scTracks = useAudioStore((s) => s.soundcloudTracks);
  const loading = useAudioStore((s) => s.soundcloudLoading);
  const error = useAudioStore((s) => s.soundcloudError);
  const kind = useAudioStore((s) => s.kind);
  const currentIndex = useAudioStore((s) => s.currentIndex);
  const pendingIndex = useAudioStore((s) => s.pendingIndex);
  const isPlaying = useAudioStore((s) => s.isPlaying);

  const loadPlaylist = useAudioStore((s) => s.loadSoundcloudPlaylist);
  const clearSoundcloud = useAudioStore((s) => s.clearSoundcloud);
  const playIndex = useAudioStore((s) => s.playIndex);
  // Shared with the player panel and restored from localStorage on load.
  const url = useAudioStore((s) => s.soundcloudUrl);
  const setUrl = useAudioStore((s) => s.setSoundcloudUrl);

  return (
    <Popover>
      <PopoverTrigger
        aria-label="SoundCloud playlist"
        className={cn(
          "flex shrink-0 items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition",
          kind === "soundcloud"
            ? "border-foreground/30 bg-foreground/10"
            : "hover:bg-foreground/5",
        )}
      >
        <Cloud className="h-3.5 w-3.5" />
        SoundCloud
      </PopoverTrigger>

      <PopoverContent align="start" className="w-80 p-0">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (url.trim()) void loadPlaylist(url.trim());
          }}
          className="flex gap-2 border-b p-3"
        >
          <input
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://soundcloud.com/…/sets/…"
            aria-label="SoundCloud playlist link"
            className="min-w-0 flex-1 rounded-md border bg-transparent px-2 py-1.5 text-xs outline-none placeholder:text-muted-foreground"
          />
          <button
            type="submit"
            disabled={loading || !url.trim()}
            className="shrink-0 rounded-md border px-2 py-1.5 text-xs transition hover:bg-foreground/5 disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Load"}
          </button>
        </form>

        {error && <p className="px-3 py-2 text-xs text-destructive">{error}</p>}

        {playlist && (
          <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
            <div className="min-w-0">
              <p className="truncate text-xs font-medium">{playlist.title}</p>
              <p className="text-[11px] text-muted-foreground">
                {scTracks.length} playable
              </p>
            </div>
            <button
              type="button"
              onClick={clearSoundcloud}
              aria-label="Clear playlist"
              className="shrink-0 text-muted-foreground transition hover:text-foreground"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        <ul className="max-h-64 overflow-y-auto py-1">
          {scTracks.length === 0 ? (
            <li className="px-3 py-2 text-xs text-muted-foreground">
              Paste a public SoundCloud playlist link to load its tracks.
            </li>
          ) : (
            scTracks.map((track, index) => {
              const active = kind === "soundcloud" && index === currentIndex;
              const starting = kind === "soundcloud" && index === pendingIndex;

              return (
                <li key={track.id}>
                  <button
                    type="button"
                    onClick={() => void playIndex(index)}
                    className={cn(
                      "flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-left transition",
                      // Highlighted while it loads too, so the click lands
                      // before the sound does.
                      active || starting
                        ? "bg-foreground/10"
                        : "hover:bg-foreground/5",
                    )}
                  >
                    <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                      {starting ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : active && isPlaying ? (
                        <Volume2 className="h-3.5 w-3.5" />
                      ) : null}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs">{track.name}</span>
                      <span className="block truncate text-[11px] text-muted-foreground">
                        {track.artist}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })
          )}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

interface EditorTransportProps {
  /** Expanded by the fullscreen button — the preview, not the whole editor. */
  fullscreenTarget: RefObject<HTMLElement | null>;
}

/**
 * E6.14 — the same audio source and transport, available while editing. Shares
 * the session audio store with the player, so a track keeps playing across the
 * jump into the editor.
 */
export function EditorTransport({ fullscreenTarget }: EditorTransportProps) {
  const kind = useAudioStore((s) => s.kind);
  const tracks = useActiveTracks();
  const currentIndex = useAudioStore((s) => s.currentIndex);
  const pendingIndex = useAudioStore((s) => s.pendingIndex);
  const isPlaying = useAudioStore((s) => s.isPlaying);
  const position = useAudioStore((s) => s.position);
  const duration = useAudioStore((s) => s.duration);

  const enableMic = useAudioStore((s) => s.enableMic);
  const disableMic = useAudioStore((s) => s.disableMic);
  const addFiles = useAudioStore((s) => s.addFiles);
  const addViaPicker = useAudioStore((s) => s.addViaPicker);
  const togglePlay = useAudioStore((s) => s.togglePlay);
  const nextTrack = useAudioStore((s) => s.nextTrack);
  const prevTrack = useAudioStore((s) => s.prevTrack);
  const seek = useAudioStore((s) => s.seek);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const fsa = useSupportsFileSystemAccess();
  const micLive = kind === "mic";
  const level = useAudioLevel(micLive);
  const { isFullscreen, toggle: toggleFullscreen } = useFullscreen(fullscreenTarget);

  const starting = pendingIndex !== -1;
  // The track being started wins, so the name changes the moment it is picked
  // rather than once the stream opens.
  const track = tracks[starting ? pendingIndex : currentIndex];
  const hasTracks = tracks.length > 0;

  return (
    <div className="flex shrink-0 items-center gap-2 border-y px-3 py-2">
      <div className="flex min-w-28 flex-1 items-center gap-2">
        <span className="w-8 shrink-0 text-right font-mono text-[10px] text-muted-foreground">
          {formatTime(position)}
        </span>
        <input
          type="range"
          aria-label="Seek audio"
          min={0}
          max={duration || 0}
          step={0.1}
          value={Math.min(position, duration || 0)}
          disabled={!duration}
          onChange={(event) => seek(Number(event.target.value))}
          className="h-1 min-w-0 flex-1 cursor-pointer appearance-none rounded-full bg-foreground/15 accent-foreground disabled:cursor-default disabled:opacity-40"
        />
        <span className="w-8 shrink-0 font-mono text-[10px] text-muted-foreground">
          {formatTime(duration)}
        </span>
      </div>

      <div className="flex items-center gap-1.5">
        <button
          type="button"
          aria-label="Previous track"
          disabled={!hasTracks}
          onClick={() => void prevTrack()}
          className="text-muted-foreground transition hover:text-foreground disabled:opacity-30"
        >
          <SkipBack className="h-4 w-4 fill-current" />
        </button>
        <button
          type="button"
          aria-label={starting ? "Loading" : isPlaying ? "Pause" : "Play"}
          // Disabled only while a track opens: pressing play again mid-load
          // would start whatever sits at index 0 instead.
          disabled={!hasTracks || starting}
          onClick={() => void togglePlay()}
          className={cn(
            "text-muted-foreground transition hover:text-foreground disabled:opacity-30",
            starting && "disabled:opacity-100 disabled:text-foreground",
          )}
        >
          {starting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : isPlaying ? (
            <Pause className="h-4 w-4 fill-current" />
          ) : (
            <Play className="h-4 w-4 fill-current" />
          )}
        </button>
        <button
          type="button"
          aria-label="Next track"
          disabled={!hasTracks}
          onClick={() => void nextTrack()}
          className="text-muted-foreground transition hover:text-foreground disabled:opacity-30"
        >
          <SkipForward className="h-4 w-4 fill-current" />
        </button>
      </div>

      <p className="min-w-0 max-w-40 truncate text-xs text-muted-foreground">
        {track?.name ?? "Silent — time-driven"}
      </p>

      {micLive && (
        <div className="h-1 w-12 shrink-0 overflow-hidden rounded-full bg-foreground/10">
          <div
            className="h-full rounded-full bg-foreground/70"
            style={{ width: `${Math.min(100, Math.round(Math.sqrt(level) * 140))}%` }}
          />
        </div>
      )}

      <SoundcloudPopover />

      <button
        type="button"
        onClick={() => (fsa ? void addViaPicker() : inputRef.current?.click())}
        className="flex shrink-0 items-center gap-1 rounded-md border px-2 py-1 text-xs transition hover:bg-foreground/5"
      >
        <Plus className="h-3 w-3" />
        Files
      </button>

      <button
        type="button"
        onClick={() => (micLive ? disableMic() : void enableMic())}
        aria-label={micLive ? "Disable microphone" : "Enable microphone"}
        className={cn(
          "flex shrink-0 items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition",
          micLive ? "border-foreground/30 bg-foreground/10" : "hover:bg-foreground/5",
        )}
      >
        {micLive ? <Mic className="h-3.5 w-3.5" /> : <MicOff className="h-3.5 w-3.5" />}
        Mic
      </button>

      <button
        type="button"
        onClick={toggleFullscreen}
        aria-label={isFullscreen ? "Exit fullscreen" : "Fullscreen preview"}
        className="shrink-0 rounded-md border p-1.5 text-muted-foreground transition hover:bg-foreground/5 hover:text-foreground"
      >
        {isFullscreen ? (
          <Minimize className="h-3.5 w-3.5" />
        ) : (
          <Maximize className="h-3.5 w-3.5" />
        )}
      </button>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED}
        multiple
        hidden
        onChange={(event) => {
          addFiles(Array.from(event.target.files ?? []));
          event.target.value = "";
        }}
      />
    </div>
  );
}
