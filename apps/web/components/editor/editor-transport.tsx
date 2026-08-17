"use client";

import { Mic, MicOff, Pause, Play, Plus, SkipBack, SkipForward } from "lucide-react";
import { useRef } from "react";

import { useAudioLevel } from "@/hooks/use-audio-level";
import { useSupportsFileSystemAccess } from "@/hooks/use-capabilities";
import { useActiveTracks, useAudioStore } from "@/lib/store/audio";
import { cn } from "@/lib/utils";

const ACCEPTED = ".mp3,.m4a,.aac,.ogg,.opus,.wav,.flac";

/**
 * E6.14 — the same audio source and transport, available while editing. Shares
 * the session audio store with the player, so a track keeps playing across the
 * jump into the editor.
 */
export function EditorTransport() {
  const kind = useAudioStore((s) => s.kind);
  const tracks = useActiveTracks();
  const currentIndex = useAudioStore((s) => s.currentIndex);
  const isPlaying = useAudioStore((s) => s.isPlaying);

  const enableMic = useAudioStore((s) => s.enableMic);
  const disableMic = useAudioStore((s) => s.disableMic);
  const addFiles = useAudioStore((s) => s.addFiles);
  const addViaPicker = useAudioStore((s) => s.addViaPicker);
  const togglePlay = useAudioStore((s) => s.togglePlay);
  const nextTrack = useAudioStore((s) => s.nextTrack);
  const prevTrack = useAudioStore((s) => s.prevTrack);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const fsa = useSupportsFileSystemAccess();
  const micLive = kind === "mic";
  const level = useAudioLevel(micLive);

  const track = tracks[currentIndex];
  const hasTracks = tracks.length > 0;

  return (
    <div className="flex shrink-0 items-center gap-3 border-y px-3 py-2">
      <button
        type="button"
        onClick={() => (micLive ? disableMic() : void enableMic())}
        aria-label={micLive ? "Disable microphone" : "Enable microphone"}
        className={cn(
          "flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition",
          micLive ? "border-foreground/30 bg-foreground/10" : "hover:bg-foreground/5",
        )}
      >
        {micLive ? <Mic className="h-3.5 w-3.5" /> : <MicOff className="h-3.5 w-3.5" />}
        Mic
      </button>

      {micLive && (
        <div className="h-1 w-16 overflow-hidden rounded-full bg-foreground/10">
          <div
            className="h-full rounded-full bg-foreground/70"
            style={{ width: `${Math.min(100, Math.round(Math.sqrt(level) * 140))}%` }}
          />
        </div>
      )}

      <div className="flex items-center gap-2">
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
          aria-label={isPlaying ? "Pause" : "Play"}
          disabled={!hasTracks}
          onClick={() => void togglePlay()}
          className="text-muted-foreground transition hover:text-foreground disabled:opacity-30"
        >
          {isPlaying ? (
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

      <p className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
        {track?.name ?? "Silent — time-driven"}
      </p>

      <button
        type="button"
        onClick={() => (fsa ? void addViaPicker() : inputRef.current?.click())}
        className="flex shrink-0 items-center gap-1 rounded-md border px-2 py-1 text-xs transition hover:bg-foreground/5"
      >
        <Plus className="h-3 w-3" />
        Tracks
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
