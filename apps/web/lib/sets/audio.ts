import { AudioEngine } from "@/lib/audio/audio-engine";
import { type MediaRef } from "./model";
import { localFile, request } from "./client";
import type { HostedPlayback } from "@/lib/hosted-audio/types";
import type { Scheduled } from "./scheduler";
type Deck = {
  engine: AudioEngine;
  gain: GainNode;
  ready: boolean;
  failed: boolean;
  position: number;
  cancelled: boolean;
  resuming: boolean;
};
/** Reuses the player audio adapters; all decks share one clock, output and analyser. */
export class SetAudio {
  readonly context = new AudioContext();
  readonly analyser = this.context.createAnalyser();
  private master = this.context.createGain();
  private decks = new Map<string, Deck>();
  private disposed = false;
  constructor(private onError: (category: string, message: string) => void) {
    this.analyser.fftSize = 2048;
    this.master.connect(this.analyser);
    this.analyser.connect(this.context.destination);
  }
  unlock() {
    return this.context.resume();
  }
  async load(media: MediaRef, deck: Deck) {
    try {
      if (media.source === "file") {
        const file = await localFile(media.id);
        if (!file) throw new Error("Local file unavailable.");
        if (this.disposed || deck.cancelled) return;
        await deck.engine.playFile(file);
      } else if (media.source === "hosted") {
        const data = await request<HostedPlayback>(
          `/api/tracks/${encodeURIComponent(media.id)}/playback`,
        );
        if (this.disposed || deck.cancelled) return;
        const source =
          data.sources.find((s) => s.format === "mp3") ?? data.sources[0];
        if (!source) throw new Error("No playable rendition.");
        await deck.engine.playUrl(source.url);
      } else {
        const data = await request<{ url: string }>(
          `/api/soundcloud/stream/${encodeURIComponent(media.id)}`,
        );
        if (this.disposed || deck.cancelled) return;
        await deck.engine.playHlsStream(data.url);
      }
      if (
        this.disposed ||
        deck.cancelled ||
        ![...this.decks.values()].includes(deck)
      ) {
        deck.engine.dispose();
        return;
      }
      deck.engine.seek(deck.position / 1000);
      deck.ready = true;
    } catch (e) {
      if (this.disposed || deck.cancelled) return;
      deck.failed = true;
      deck.engine.pause();
      this.onError(
        e instanceof DOMException && e.name === "NotAllowedError"
          ? "autoplay"
          : "audio",
        `${media.title}: ${e instanceof Error ? e.message : "Playback failed."}`,
      );
    }
  }
  sync(
    items: Scheduled[],
    playing: boolean,
    volume: number,
    upcoming: Scheduled[] = [],
  ) {
    if (this.disposed) return;
    this.master.gain.setTargetAtTime(volume, this.context.currentTime, 0.01);
    const activeIds = new Set(items.map((x) => x.clip.id));
    const prepared = upcoming.filter((x) => !activeIds.has(x.clip.id));
    const ids = new Set([...items, ...prepared].map((x) => x.clip.id));
    for (const [id, d] of this.decks)
      if (!ids.has(id)) {
        d.cancelled = true;
        d.engine.dispose();
        d.gain.disconnect();
        this.decks.delete(id);
      }
    for (const item of [...items, ...prepared]) {
      const audible = playing && activeIds.has(item.clip.id);
      let d = this.decks.get(item.clip.id);
      if (!d) {
        const gain = this.context.createGain();
        gain.gain.value = 0;
        gain.connect(this.master);
        d = {
          engine: new AudioEngine(this.context, gain),
          gain,
          ready: false,
          failed: false,
          position: item.sourceMs,
          cancelled: false,
          resuming: false,
        };
        this.decks.set(item.clip.id, d);
        const deck = d;
        deck.engine.setEvents({
          onMediaError: () => {
            if (!deck.failed) {
              deck.failed = true;
              this.onError(
                "audio",
                `${item.clip.media.title}: playback failed.`,
              );
            }
          },
        });
        void this.load(item.clip.media, deck);
      }
      d.position = item.sourceMs;
      if (d.failed) continue;
      d.gain.gain.setTargetAtTime(
        audible ? item.level : 0,
        this.context.currentTime,
        0.008,
      );
      if (d.ready) {
        if (Math.abs(d.engine.position() * 1000 - item.sourceMs) > 250)
          d.engine.seek(item.sourceMs / 1000);
        if (!audible) d.engine.pause();
        else if (!d.resuming && !d.engine.isMediaActuallyPlaying()) {
          d.resuming = true;
          void d.engine
            .resume()
            .catch(() => {
              if (!d!.failed) {
                d!.failed = true;
                this.onError("autoplay", "Audio needs a play gesture.");
              }
            })
            .finally(() => {
              d!.resuming = false;
            });
        }
      }
    }
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (const d of this.decks.values()) {
      d.cancelled = true;
      d.engine.dispose();
      d.gain.disconnect();
    }
    this.decks.clear();
    this.master.disconnect();
    this.analyser.disconnect();
    void this.context.close();
  }
}
