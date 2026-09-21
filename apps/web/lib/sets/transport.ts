import { type SetContent, type MediaRef, emptySet, duration } from "./model";
import { schedule } from "./scheduler";
export type Override = { media: MediaRef; positionMs: number };
export type TransportState = {
  set: SetContent;
  positionMs: number;
  playing: boolean;
  loop: boolean;
  complete: boolean;
  stopped: boolean;
  audioOverride: Override | null;
  visualOverride: Override | null;
  volume: number;
  muted: boolean;
};
/** Clock is injectable: AudioContext.currentTime in output, monotonic clock during recovery. */
export class SetTransport {
  private anchor = 0;
  state: TransportState = {
    set: emptySet(),
    positionMs: 0,
    playing: false,
    loop: false,
    complete: false,
    stopped: true,
    audioOverride: null,
    visualOverride: null,
    volume: 1,
    muted: false,
  };
  constructor(private clock: () => number) {
    this.anchor = clock();
  }
  load(set: SetContent) {
    this.state = {
      ...this.state,
      set: structuredClone(set),
      positionMs: 0,
      playing: false,
      loop: set.loop,
      complete: false,
      stopped: true,
      audioOverride: null,
      visualOverride: null,
    };
    this.anchor = this.clock();
  }
  time() {
    const n =
      this.state.positionMs +
      (this.state.playing ? Math.max(0, this.clock() - this.anchor) : 0);
    const d = duration(this.state.set);
    if (d && n >= d) {
      if (this.state.loop) return n % d;
      return d;
    }
    return n;
  }
  tick() {
    const elapsed = this.state.playing
      ? Math.max(0, this.clock() - this.anchor)
      : 0;
    for (const override of [
      this.state.audioOverride,
      this.state.visualOverride,
    ])
      if (override) override.positionMs += elapsed;
    const t = this.time();
    const d = duration(this.state.set);
    if (this.state.playing && d && t >= d && !this.state.loop) {
      this.state.playing = false;
      this.state.complete = true;
      this.state.audioOverride = null;
      this.state.visualOverride = null;
    }
    this.state.positionMs = t;
    this.anchor = this.clock();
    return schedule(this.state.set, t);
  }
  play() {
    if (this.state.complete) this.seek(0);
    this.anchor = this.clock();
    this.state.playing = true;
    this.state.stopped = false;
    this.state.complete = false;
  }
  pause() {
    this.tick();
    this.state.playing = false;
  }
  stop() {
    this.state.playing = false;
    this.seek(0);
    this.state.audioOverride = null;
    this.state.visualOverride = null;
    this.state.stopped = true;
  }
  seek(ms: number) {
    this.state.positionMs = Math.max(
      0,
      Math.min(duration(this.state.set), Number.isFinite(ms) ? ms : 0),
    );
    this.anchor = this.clock();
    this.state.complete = false;
    this.state.stopped = false;
  }
  seekAudio(ms: number) {
    if (!Number.isFinite(ms)) return;
    this.tick();
    const audio = this.state.audioOverride;
    if (audio) audio.positionMs = Math.max(0, Math.min(audio.media.durationMs ?? Infinity, ms));
  }
  override(kind: "audio" | "visual", media: MediaRef | null) {
    this.tick();
    this.state[kind === "audio" ? "audioOverride" : "visualOverride"] = media
      ? { media: structuredClone(media), positionMs: 0 }
      : null;
  }
  snapshot() {
    this.tick();
    return structuredClone(this.state);
  }
  restore(state: TransportState) {
    this.state = structuredClone(state);
    this.anchor = this.clock();
  }
}
