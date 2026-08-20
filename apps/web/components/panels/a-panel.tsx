"use client";

import {
  ChevronDown,
  ChevronUp,
  Cloud,
  ExternalLink,
  Loader2,
  Mic,
  Music,
  RefreshCw,
  Trash2,
  Volume2,
  X,
} from "lucide-react";
import { useRef, useState } from "react";

import { Panel } from "@/components/panels/panel";
import { useAudioLevel } from "@/hooks/use-audio-level";
import { useIsChromium, useSupportsFileSystemAccess } from "@/hooks/use-capabilities";
import { useAudioStore } from "@/lib/store/audio";
import { useChromeStore } from "@/lib/store/chrome";
import type { AudioSourceKind } from "@/lib/types";
import { cn } from "@/lib/utils";

const ACCEPTED = ".mp3,.m4a,.aac,.ogg,.opus,.wav,.flac";

type SourceTab = "soundcloud" | "files" | "mic";

const SOURCES: { value: SourceTab; label: string; icon: typeof Cloud }[] = [
  { value: "soundcloud", label: "SoundCloud", icon: Cloud },
  { value: "files", label: "My Files", icon: Music },
  { value: "mic", label: "Mic", icon: Mic },
];

/** Which tab to show for the current audio source. */
function tabForKind(kind: AudioSourceKind): SourceTab {
  if (kind === "mic") return "mic";
  if (kind === "soundcloud") return "soundcloud";
  return "files";
}

function LevelMeter({ active }: { active: boolean }) {
  const level = useAudioLevel(active);
  // Perceptual-ish curve; raw RMS barely moves for normal room noise.
  const width = Math.min(100, Math.round(Math.sqrt(level) * 140));

  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-foreground/10">
      <div
        className="h-full rounded-full bg-foreground/70 transition-[width] duration-75"
        style={{ width: `${width}%` }}
      />
    </div>
  );
}

function formatDuration(ms?: number): string {
  if (!ms) return "";
  const total = Math.round(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/**
 * The leading glyph on a track row.
 *
 * Only two things are worth a mark: the track that is sounding, and the one
 * being fetched. A SoundCloud track needs a signed URL and an opened stream
 * before any audio arrives, which is long enough that an unchanged row looks
 * like a click that did nothing.
 *
 * The slot keeps its width whatever it holds, so a row does not jump sideways
 * the moment it is clicked.
 */
function TrackStatus({
  loading,
  current,
  playing,
}: {
  loading: boolean;
  current: boolean;
  playing: boolean;
}) {
  return (
    <span className="flex h-4 w-4 shrink-0 items-center justify-center">
      {loading ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin text-foreground" />
      ) : current && playing ? (
        <Volume2 className="h-3.5 w-3.5 text-foreground" />
      ) : null}
    </span>
  );
}

export function APanel() {
  const aOpen = useChromeStore((s) => s.aOpen);

  const kind = useAudioStore((s) => s.kind);
  const micError = useAudioStore((s) => s.micError);
  const tracks = useAudioStore((s) => s.tracks);
  const currentIndex = useAudioStore((s) => s.currentIndex);
  const pendingIndex = useAudioStore((s) => s.pendingIndex);
  const isPlaying = useAudioStore((s) => s.isPlaying);
  const pendingNames = useAudioStore((s) => s.pendingNames);

  const scPlaylist = useAudioStore((s) => s.soundcloudPlaylist);
  const scTracks = useAudioStore((s) => s.soundcloudTracks);
  const scLoading = useAudioStore((s) => s.soundcloudLoading);
  const scError = useAudioStore((s) => s.soundcloudError);

  const enableMic = useAudioStore((s) => s.enableMic);
  const disableMic = useAudioStore((s) => s.disableMic);
  const addFiles = useAudioStore((s) => s.addFiles);
  const addViaPicker = useAudioStore((s) => s.addViaPicker);
  const removeTrack = useAudioStore((s) => s.removeTrack);
  const clearTracks = useAudioStore((s) => s.clearTracks);
  const moveTrack = useAudioStore((s) => s.moveTrack);
  const playIndex = useAudioStore((s) => s.playIndex);
  const refreshSoundcloud = useAudioStore((s) => s.refreshSoundcloud);
  const loadPlaylist = useAudioStore((s) => s.loadSoundcloudPlaylist);
  const clearSoundcloud = useAudioStore((s) => s.clearSoundcloud);
  const url = useAudioStore((s) => s.soundcloudUrl);
  const setUrl = useAudioStore((s) => s.setSoundcloudUrl);
  const selectSoundcloudSource = useAudioStore((s) => s.selectSoundcloudSource);
  const selectFilesSource = useAudioStore((s) => s.selectFilesSource);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const fsa = useSupportsFileSystemAccess();
  const chromium = useIsChromium();

  // The tab follows the live source, but can be browsed independently of it —
  // you can look at your files without abandoning what is currently playing.
  const [tab, setTab] = useState<SourceTab | null>(null);
  const activeTab = tab ?? tabForKind(kind);

  const micLive = kind === "mic";

  const selectSource = (next: SourceTab) => {
    setTab(next);
    if (next === "mic") {
      if (!micLive) void enableMic();
    } else if (next === "files") {
      if (micLive) disableMic();
      selectFilesSource();
    } else {
      if (micLive) disableMic();
      if (scTracks.length > 0) selectSoundcloudSource();
    }
  };

  return (
    <Panel side="a" label="Audio source">
      <header className="shrink-0 border-b px-4 py-3">
        <h2 className="text-sm font-medium">Audio</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          A SoundCloud playlist, your own files, or the microphone.
        </p>
      </header>

      <div className="shrink-0 border-b px-4 py-3">
        <div className="grid grid-cols-3 gap-1 rounded-lg bg-foreground/5 p-1">
          {SOURCES.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              type="button"
              onClick={() => selectSource(value)}
              aria-pressed={activeTab === value}
              className={cn(
                "flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs transition",
                activeTab === value
                  ? "bg-foreground/15 font-medium"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {activeTab === "soundcloud" && (
        <section className="flex min-h-0 flex-1 flex-col">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (url.trim()) void loadPlaylist(url.trim());
            }}
            className="shrink-0 space-y-2 px-4 py-3"
          >
            <label htmlFor="sc-url" className="text-xs text-muted-foreground">
              Playlist link
            </label>
            <div className="flex gap-2">
              <input
                id="sc-url"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                placeholder="https://soundcloud.com/…/sets/…"
                className="min-w-0 flex-1 rounded-md border bg-transparent px-2 py-1.5 text-xs outline-none placeholder:text-muted-foreground"
              />
              <button
                type="submit"
                disabled={scLoading || !url.trim()}
                className="shrink-0 rounded-md border px-2 py-1.5 text-xs transition hover:bg-foreground/5 disabled:opacity-50"
              >
                {scLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Load"}
              </button>
            </div>

            {scError && <p className="text-xs text-destructive">{scError}</p>}
          </form>

          {scPlaylist && (
            <div className="flex shrink-0 items-center justify-between gap-2 px-4 pb-2">
              <div className="min-w-0">
                <p className="truncate text-xs font-medium">{scPlaylist.title}</p>
                <p className="text-[11px] text-muted-foreground">
                  {scTracks.length} playable
                  {scPlaylist.unplayable > 0 &&
                    ` · ${scPlaylist.unplayable} unavailable`}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {scPlaylist.permalinkUrl && (
                  <a
                    href={scPlaylist.permalinkUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    aria-label="Open on SoundCloud"
                    className="text-muted-foreground transition hover:text-foreground"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                )}
                <button
                  type="button"
                  onClick={() => void refreshSoundcloud()}
                  disabled={scLoading}
                  aria-label="Refresh playlist"
                  title="Reload the playlist from SoundCloud"
                  className="text-muted-foreground transition hover:text-foreground disabled:opacity-40"
                >
                  <RefreshCw className={cn("h-3.5 w-3.5", scLoading && "animate-spin")} />
                </button>
                <button
                  type="button"
                  onClick={clearSoundcloud}
                  aria-label="Clear playlist"
                  className="text-muted-foreground transition hover:text-foreground"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )}

          <ul className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-3">
            {scTracks.length === 0 ? (
              <li className="px-4 py-2 text-xs text-muted-foreground">
                Paste a public SoundCloud playlist link to load its tracks.
              </li>
            ) : (
              scTracks.map((track, index) => {
                const active = kind === "soundcloud" && index === currentIndex;
                const loading = kind === "soundcloud" && index === pendingIndex;

                return (
                <li
                  key={track.id}
                  className={cn(
                    "flex items-center gap-2 px-4 py-1.5 transition",
                    // Tailwind emits `hover:bg-*` after plain `bg-*`, so an
                    // unconditional hover tint *dims* an already-highlighted
                    // row. The row that is playing keeps its own shade.
                    !(active || loading) && "hover:bg-foreground/5",
                    // Highlighted while loading too, so the click registers
                    // before the sound does.
                    (active || loading) && "bg-foreground/10",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => void playIndex(index)}
                    className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-left"
                  >
                    <TrackStatus loading={loading} current={active} playing={isPlaying} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs">{track.name}</span>
                      <span className="block truncate text-[11px] text-muted-foreground">
                        {track.artist}
                      </span>
                    </span>
                  </button>
                  <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                    {formatDuration(track.durationMs)}
                  </span>
                </li>
                );
              })
            )}
          </ul>
        </section>
      )}

      {activeTab === "files" && (
        <section className="flex min-h-0 flex-1 flex-col">
          <div className="flex shrink-0 items-center justify-between gap-2 px-4 py-3">
            <h3 className="text-xs font-medium">Tracklist</h3>
            <div className="flex items-center gap-2">
              {tracks.length > 0 && (
                <button
                  type="button"
                  onClick={clearTracks}
                  className="text-muted-foreground transition hover:text-foreground"
                  aria-label="Clear tracklist"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
              <button
                type="button"
                onClick={() => (fsa ? void addViaPicker() : inputRef.current?.click())}
                className="rounded-md border px-2 py-1 text-xs transition hover:bg-foreground/5"
              >
                Add files
              </button>
            </div>
          </div>

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

          <p className="shrink-0 px-4 pb-2 text-[11px] text-muted-foreground">
            MP3, M4A, AAC, OGG, Opus, WAV, FLAC. Nothing is uploaded.
          </p>

          {pendingNames.length > 0 && (
            <div className="mx-4 mb-2 shrink-0 rounded-md border border-dashed px-3 py-2">
              <p className="text-[11px] text-muted-foreground">
                {pendingNames.length} track
                {pendingNames.length === 1 ? "" : "s"} from your last session need
                re-adding:{" "}
                <span className="text-foreground">{pendingNames.join(", ")}</span>
              </p>
              {!chromium && (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  A Chromium browser can reopen these automatically.
                </p>
              )}
            </div>
          )}

          <ul className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-3">
            {tracks.length === 0 ? (
              <li className="px-4 py-2 text-xs text-muted-foreground">
                No tracks yet — the visualisation runs time-driven until you add some.
              </li>
            ) : (
              tracks.map((track, index) => {
                const active = kind === "files" && index === currentIndex;
                const loading = kind === "files" && index === pendingIndex;

                return (
                <li
                  key={track.id}
                  className={cn(
                    // `group` still drives the reorder controls on hover.
                    "group flex items-center gap-2 px-4 py-1.5 transition",
                    // Tailwind emits `hover:bg-*` after plain `bg-*`, so an
                    // unconditional hover tint *dims* an already-highlighted
                    // row. The row that is playing keeps its own shade.
                    !(active || loading) && "hover:bg-foreground/5",
                    (active || loading) && "bg-foreground/10",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => void playIndex(index)}
                    className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-left"
                  >
                    <TrackStatus loading={loading} current={active} playing={isPlaying} />
                    <span className="min-w-0 flex-1 truncate text-xs">{track.name}</span>
                  </button>

                  <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100">
                    <button
                      type="button"
                      aria-label="Move up"
                      disabled={index === 0}
                      onClick={() => moveTrack(index, index - 1)}
                      className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                    >
                      <ChevronUp className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      aria-label="Move down"
                      disabled={index === tracks.length - 1}
                      onClick={() => moveTrack(index, index + 1)}
                      className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                    >
                      <ChevronDown className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      aria-label={`Remove ${track.name}`}
                      onClick={() => removeTrack(track.id)}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </li>
                );
              })
            )}
          </ul>
        </section>
      )}

      {activeTab === "mic" && (
        <section className="shrink-0 space-y-2 px-4 py-3">
          <button
            type="button"
            onClick={() => (micLive ? disableMic() : void enableMic())}
            className={cn(
              "flex w-full items-center justify-center gap-2 rounded-md border px-3 py-2 text-xs transition",
              micLive ? "border-foreground/30 bg-foreground/10" : "hover:bg-foreground/5",
            )}
          >
            <Mic className="h-3.5 w-3.5" />
            {micLive ? "Microphone live" : "Enable microphone"}
          </button>

          {micLive && <LevelMeter active={aOpen} />}
          {micError && <p className="text-xs text-destructive">{micError}</p>}

          <p className="text-[11px] leading-relaxed text-muted-foreground">
            The mic hears whatever your speakers play. On headphones it hears the
            room instead — so the visualisation won&apos;t react to your music.
          </p>
        </section>
      )}
    </Panel>
  );
}
