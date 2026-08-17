/**
 * The Web Audio graph behind the A panel.
 *
 * Everything is lazy: no AudioContext is constructed until the viewer does
 * something that needs one, because browsers start contexts suspended and
 * autoplay policy only lets a user gesture resume them.
 *
 * The AnalyserNode this exposes is the seam for E1.6 — the engine can't consume
 * it yet (the DSL has no audio bindings), so today it drives the level meter
 * and nothing else.
 */

const FFT_SIZE = 2048;

export interface AudioEngineEvents {
  onTimeUpdate?: (position: number, duration: number) => void;
  onEnded?: () => void;
}

class AudioEngine {
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;

  private micStream: MediaStream | null = null;
  private micSource: MediaStreamAudioSourceNode | null = null;

  private element: HTMLAudioElement | null = null;
  /** A media element may only be adopted by one source node, ever. */
  private elementSource: MediaElementAudioSourceNode | null = null;
  private objectUrl: string | null = null;
  /** Active hls.js session, when the current source needs one. */
  private hls: import("hls.js").default | null = null;

  private levelBuffer: Uint8Array<ArrayBuffer> | null = null;
  private events: AudioEngineEvents = {};

  setEvents(events: AudioEngineEvents) {
    this.events = events;
  }

  /** Must be called from a user gesture the first time. */
  private ensureContext(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = FFT_SIZE;
      this.levelBuffer = new Uint8Array(new ArrayBuffer(this.analyser.fftSize));
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
    return this.ctx;
  }

  getAnalyser(): AnalyserNode | null {
    return this.analyser;
  }

  /** RMS of the current window, 0..1. Returns 0 when nothing is connected. */
  getLevel(): number {
    if (!this.analyser || !this.levelBuffer) return 0;

    this.analyser.getByteTimeDomainData(this.levelBuffer);

    let sum = 0;
    for (let i = 0; i < this.levelBuffer.length; i += 1) {
      // Byte time-domain data is centred on 128.
      const deviation = (this.levelBuffer[i]! - 128) / 128;
      sum += deviation * deviation;
    }
    return Math.sqrt(sum / this.levelBuffer.length);
  }

  // ── Microphone ────────────────────────────────────────────────────────────

  async enableMic(): Promise<void> {
    const ctx = this.ensureContext();

    // Only ever requested from an explicit click (E4.1).
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    });

    this.micStream = stream;
    this.micSource = ctx.createMediaStreamSource(stream);
    // Deliberately not connected to destination — that would echo the room.
    this.micSource.connect(this.analyser!);
  }

  disableMic(): void {
    this.micSource?.disconnect();
    this.micSource = null;
    this.micStream?.getTracks().forEach((track) => track.stop());
    this.micStream = null;
  }

  // ── Local files ───────────────────────────────────────────────────────────

  private ensureElement(): HTMLAudioElement {
    if (this.element) return this.element;

    const element = new Audio();
    element.crossOrigin = "anonymous";
    element.addEventListener("timeupdate", () => {
      this.events.onTimeUpdate?.(element.currentTime, element.duration || 0);
    });
    element.addEventListener("durationchange", () => {
      this.events.onTimeUpdate?.(element.currentTime, element.duration || 0);
    });
    element.addEventListener("ended", () => this.events.onEnded?.());

    this.element = element;
    return element;
  }

  /** Routes the media element into the analyser. Safe to call repeatedly. */
  private connectElement(ctx: AudioContext, element: HTMLAudioElement): void {
    if (this.elementSource) return;

    this.elementSource = ctx.createMediaElementSource(element);
    this.elementSource.connect(this.analyser!);
    // This is music the viewer chose, so it should be audible.
    this.analyser!.connect(ctx.destination);
  }

  /** Tears down any HLS session without disturbing the audio graph. */
  private detachHls(): void {
    this.hls?.destroy();
    this.hls = null;
  }

  async playFile(file: File): Promise<void> {
    const ctx = this.ensureContext();
    const element = this.ensureElement();
    this.detachHls();
    this.connectElement(ctx, element);

    if (this.objectUrl) URL.revokeObjectURL(this.objectUrl);
    this.objectUrl = URL.createObjectURL(file);
    element.src = this.objectUrl;

    await element.play();
  }

  /**
   * Plays an HLS stream — the only format SoundCloud offers.
   *
   * Safari can play HLS from a plain `src`; everywhere else hls.js fetches the
   * segments itself and feeds them through MediaSource. Either way the audio
   * reaches the same element, so the analyser still sees it: the CDN sends
   * `access-control-allow-origin: *`, so nothing taints the graph.
   *
   * hls.js is imported on demand so its weight never lands on visitors who
   * only ever use the microphone or their own files.
   */
  async playHlsStream(url: string): Promise<void> {
    const ctx = this.ensureContext();
    const element = this.ensureElement();
    this.detachHls();
    this.connectElement(ctx, element);

    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }

    const { default: Hls } = await import("hls.js");

    // Media Source Extensions are checked *before* canPlayType, because Chrome
    // answers "maybe" to the HLS mime type and then silently stalls on it. Only
    // browsers without MSE — Safari — should take the native path.
    if (!Hls.isSupported()) {
      if (element.canPlayType("application/vnd.apple.mpegurl")) {
        element.src = url;
        await element.play();
        return;
      }
      throw new Error("This browser cannot play SoundCloud streams");
    }

    const hls = new Hls({ enableWorker: true });
    this.hls = hls;

    await new Promise<void>((resolve, reject) => {
      hls.on(Hls.Events.MANIFEST_PARSED, () => resolve());
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) reject(new Error(data.details ?? "HLS playback failed"));
      });

      hls.loadSource(url);
      hls.attachMedia(element);
    });

    await element.play();
  }

  async resume(): Promise<void> {
    this.ensureContext();
    await this.element?.play();
  }

  pause(): void {
    this.element?.pause();
  }

  seek(seconds: number): void {
    if (this.element) this.element.currentTime = seconds;
  }

  /** Detach any media playback without tearing down the context. */
  stopFiles(): void {
    this.detachHls();
    this.element?.pause();
    if (this.element) this.element.removeAttribute("src");
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }
  }
}

let engine: AudioEngine | null = null;

/** Lazily created so nothing touches Web Audio during SSR. */
export function getAudioEngine(): AudioEngine {
  if (!engine) engine = new AudioEngine();
  return engine;
}

export type { AudioEngine };
