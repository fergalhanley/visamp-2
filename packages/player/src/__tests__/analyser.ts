/**
 * A faithful stand-in for `AnalyserNode.getByteFrequencyData`, so beat
 * detection can be tested against real spectra derived from a real waveform
 * rather than against a hand-drawn picture of what a spectrum might look like.
 *
 * Follows the Web Audio spec: Blackman window, FFT, magnitude normalised by
 * `fftSize`, exponential smoothing, then a dB mapping onto 0–255 between
 * `minDecibels` and `maxDecibels`.
 */

export const FFT_SIZE = 2048;
export const SAMPLE_RATE = 44100;
const SMOOTHING = 0.8;
const MIN_DB = -100;
const MAX_DB = -30;

/** In-place iterative radix-2 Cooley-Tukey. */
function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;

  for (let i = 1, j = 0; i < n; i += 1) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j]!, re[i]!];
      [im[i], im[j]] = [im[j]!, im[i]!];
    }
  }

  for (let len = 2; len <= n; len <<= 1) {
    const angle = (-2 * Math.PI) / len;
    const wRe = Math.cos(angle);
    const wIm = Math.sin(angle);

    for (let i = 0; i < n; i += len) {
      let curRe = 1;
      let curIm = 0;

      for (let k = 0; k < len / 2; k += 1) {
        const aRe = re[i + k]!;
        const aIm = im[i + k]!;
        const bRe = re[i + k + len / 2]! * curRe - im[i + k + len / 2]! * curIm;
        const bIm = re[i + k + len / 2]! * curIm + im[i + k + len / 2]! * curRe;

        re[i + k] = aRe + bRe;
        im[i + k] = aIm + bIm;
        re[i + k + len / 2] = aRe - bRe;
        im[i + k + len / 2] = aIm - bIm;

        const nextRe = curRe * wRe - curIm * wIm;
        curIm = curRe * wIm + curIm * wRe;
        curRe = nextRe;
      }
    }
  }
}

const blackman = (() => {
  const w = new Float64Array(FFT_SIZE);
  const a0 = 0.42;
  const a1 = 0.5;
  const a2 = 0.08;
  for (let i = 0; i < FFT_SIZE; i += 1) {
    w[i] =
      a0 -
      a1 * Math.cos((2 * Math.PI * i) / FFT_SIZE) +
      a2 * Math.cos((4 * Math.PI * i) / FFT_SIZE);
  }
  return w;
})();

/** Streams byte spectra over a waveform, the way the analyser would. */
export class Analyser {
  readonly bins = FFT_SIZE / 2;
  private readonly smoothed = new Float64Array(FFT_SIZE / 2);
  // Reused across frames. A track is a thousand-odd windows, and allocating
  // three buffers per window made this harness cost more than the code it
  // exercises.
  private readonly re = new Float64Array(FFT_SIZE);
  private readonly im = new Float64Array(FFT_SIZE);
  private readonly out = new Uint8Array(FFT_SIZE / 2);

  /** @param samples Mono float samples at `SAMPLE_RATE`. */
  constructor(private readonly samples: Float64Array) {}

  /**
   * The byte spectrum for the window ending at `sampleIndex`.
   *
   * The returned array is reused, so read it before asking for the next frame.
   */
  at(sampleIndex: number): Uint8Array {
    const re = this.re;
    const im = this.im;
    im.fill(0);
    const start = Math.max(0, sampleIndex - FFT_SIZE);

    for (let i = 0; i < FFT_SIZE; i += 1) {
      re[i] = (this.samples[start + i] ?? 0) * blackman[i]!;
    }

    fft(re, im);

    const out = this.out;
    for (let k = 0; k < this.bins; k += 1) {
      const magnitude = Math.hypot(re[k]!, im[k]!) / FFT_SIZE;
      this.smoothed[k] = SMOOTHING * this.smoothed[k]! + (1 - SMOOTHING) * magnitude;

      const db = 20 * Math.log10(this.smoothed[k]! || 1e-12);
      const scaled = (255 * (db - MIN_DB)) / (MAX_DB - MIN_DB);
      out[k] = Math.max(0, Math.min(255, Math.floor(scaled)));
    }

    return out;
  }
}

export interface TrackOptions {
  seconds?: number;
  /** Milliseconds between kicks. 500 is 120bpm. */
  kickIntervalMs?: number;
  /** Sustained bassline level; this is what dilutes a wide detection band. */
  bassLevel?: number;
  /** Offbeat hi-hats, well above the kick band. */
  hats?: boolean;
  /** Soft-clip drive, as a loud master would have. */
  drive?: number;
}

/**
 * A mastered-sounding loop: kick, sustained bassline, mids and offbeat hats,
 * soft-clipped. The sustained parts are the point — they keep overall loudness
 * near constant so only the kick band actually moves.
 */
export function renderTrack({
  seconds = 20,
  kickIntervalMs = 500,
  bassLevel = 0.28,
  hats = true,
  drive = 1.6,
}: TrackOptions = {}): Float64Array {
  const period = kickIntervalMs / 1000;
  const samples = new Float64Array(Math.floor(SAMPLE_RATE * seconds));
  let noise = 12345;

  for (let n = 0; n < samples.length; n += 1) {
    const t = n / SAMPLE_RATE;
    const since = t % period;

    const env = since < 0.25 ? Math.exp(-since * 22) : 0;
    const pitch = 55 + 60 * Math.exp(-since * 40);
    const kick = Math.sin(2 * Math.PI * pitch * since) * env * 0.85;

    const bass = Math.sin(2 * Math.PI * 110 * t) * bassLevel;
    const mid =
      (Math.sin(2 * Math.PI * 440 * t) + Math.sin(2 * Math.PI * 660 * t)) * 0.14;

    let hat = 0;
    if (hats) {
      const hatSince = (t + period / 2) % period;
      if (hatSince < 0.04) {
        noise = (noise * 1103515245 + 12345) % 2147483648;
        hat = (noise / 1073741824 - 1) * Math.exp(-hatSince * 90) * 0.3;
      }
    }

    samples[n] = Math.tanh((kick + bass + mid + hat) * drive) * 0.95;
  }

  return samples;
}

/** Steps an analyser over a waveform at 60fps, yielding frames. */
export function* frames(
  samples: Float64Array,
  frameMs = 1000 / 60,
): Generator<{ frequency: Uint8Array; now: number }> {
  const analyser = new Analyser(samples);
  const hop = (frameMs / 1000) * SAMPLE_RATE;

  for (let index = 0; ; index += 1) {
    const sampleIndex = Math.floor(index * hop);
    if (sampleIndex >= samples.length) return;
    yield { frequency: analyser.at(sampleIndex), now: index * frameMs };
  }
}
