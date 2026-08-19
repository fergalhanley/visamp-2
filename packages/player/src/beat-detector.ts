/**
 * Beat detection from the kick band of the spectrum.
 *
 * Three things make this work on real, mastered audio:
 *
 * 1. **A narrow band.** The kick lives around 40–120Hz. Averaging a wide slice
 *    of the spectrum instead measures overall loudness, and overall loudness in
 *    mastered music barely moves — the kick is there, but diluted by seventy
 *    bins of bassline and vocal that never stop.
 *
 * 2. **Comparing against a moving baseline, not against zero.** Loud masters
 *    sit near the top of the range, so any test of the form "is this frame a
 *    multiple of the recent average" is unsatisfiable: nothing can be 1.5x an
 *    average that is already close to the ceiling. Subtracting a slow baseline
 *    turns a steady floor into roughly zero and leaves the transient behind.
 *
 * 3. **A bar that scales with how much the signal normally moves.** A track
 *    that swings hard needs a bigger spike to count than a subtle one, and a
 *    fixed number cannot serve both.
 *
 * Everything is in milliseconds rather than frames, so a 30Hz tab and a 144Hz
 * display behave the same.
 */

/** The kick fundamental and its first harmonics. */
const BAND_LOW_HZ = 20;
const BAND_HIGH_HZ = 200;

/** Time constant for the slow baseline the transient is measured against. */
const BASELINE_TAU_MS = 900;

/**
 * Time constants for the running estimate of ordinary movement, which is
 * deliberately asymmetric: slow to rise, quick to fall.
 *
 * A symmetric average is pumped up by the very beats it is meant to measure
 * against, so every second kick lands under the bar it just raised and gets
 * missed. Rising slowly means a brief transient barely moves the estimate,
 * while a genuinely busier passage still lifts it over a few seconds.
 */
const DEVIATION_RISE_TAU_MS = 4000;
const DEVIATION_FALL_TAU_MS = 400;

/** How far above ordinary movement a frame must sit to count as a beat. */
const THRESHOLD_K = 2.2;

/**
 * Absolute lower bar, as a fraction of full scale. Without it, a passage that
 * is perfectly steady drives the deviation estimate toward zero and then any
 * rounding flicker clears the bar.
 */
const MIN_EXCESS = 0.015;

/**
 * Shortest gap between beats. A kick's low end stays raised for roughly
 * 200ms once the analyser's own smoothing is added, so a shorter window lets
 * a single kick register twice. 250ms still allows 240bpm, comfortably above
 * any real four-to-the-floor.
 */
const REFRACTORY_MS = 250;

/** Band energy below this is treated as silence rather than very quiet music. */
const SILENCE_FLOOR = 0.02;

/** Used when the caller cannot say; only affects which bins the band maps to. */
const DEFAULT_SAMPLE_RATE = 44100;

/** Guards the EMAs against a stalled tab returning a huge frame delta. */
const MAX_FRAME_MS = 250;

/**
 * How long audio must have been playing before beats are reported.
 *
 * The first moments of playback are a ramp from nothing, which looks exactly
 * like one long transient: it fires a burst of false beats and, worse, leaves
 * the deviation estimate so inflated that real beats are missed for seconds
 * afterwards. Staying quiet while the estimates settle costs one kick and
 * avoids both.
 */
const WARMUP_MS = 400;

/** Baseline time constant during warm-up: fast, to catch the opening ramp. */
const WARMUP_TAU_MS = 80;

export interface BeatDetectorOptions {
  /**
   * Scales the threshold. Above 1 needs a bigger spike (fewer beats), below 1
   * is more eager.
   */
  sensitivity?: number;
}

export class BeatDetector {
  private baseline = 0;
  private deviation = 0;
  private seeded = false;
  private lastBeatAt = Number.NEGATIVE_INFINITY;
  private lastFrameAt: number | null = null;
  /** When the current run of audible sound began; null while silent. */
  private audibleSince: number | null = null;
  /** False while the signal is still above the bar from the last beat. */
  private armed = true;
  private readonly sensitivity: number;

  constructor({ sensitivity = 1 }: BeatDetectorOptions = {}) {
    this.sensitivity = sensitivity;
  }

  reset(): void {
    this.baseline = 0;
    this.deviation = 0;
    this.seeded = false;
    this.lastBeatAt = Number.NEGATIVE_INFINITY;
    this.lastFrameAt = null;
    this.audibleSince = null;
    this.armed = true;
  }

  /**
   * @param frequency  Byte spectrum from `getByteFrequencyData`.
   * @param now        Timestamp in ms.
   * @param sampleRate The context's sample rate, so the band stays fixed in Hz
   *                   whatever `fftSize` is.
   */
  detect(
    frequency: Uint8Array,
    now: number,
    sampleRate: number = DEFAULT_SAMPLE_RATE,
  ): boolean {
    if (frequency.length === 0) return false;

    const hzPerBin = sampleRate / 2 / frequency.length;
    // Bin 0 holds DC and any rumble, and carries no rhythm; start above it.
    const first = Math.max(1, Math.floor(BAND_LOW_HZ / hzPerBin));
    const end = Math.min(
      frequency.length,
      Math.max(first + 1, Math.ceil(BAND_HIGH_HZ / hzPerBin)),
    );

    let sum = 0;
    for (let i = first; i < end; i += 1) sum += frequency[i]!;
    const energy = sum / (end - first) / 255;

    const dt =
      this.lastFrameAt === null
        ? 1000 / 60
        : Math.min(Math.max(now - this.lastFrameAt, 1), MAX_FRAME_MS);
    this.lastFrameAt = now;

    // Silence is not a quiet passage to measure against: it resets the run, so
    // that when audio returns it gets a fresh warm-up rather than being judged
    // against a baseline of nothing.
    if (energy < SILENCE_FLOOR) {
      this.audibleSince = null;
      this.baseline = energy;
      this.deviation = 0;
      this.seeded = true;
      return false;
    }

    // Seeding on the first audible frame stops the climb from zero reading as
    // one enormous transient.
    if (!this.seeded) {
      this.baseline = energy;
      this.seeded = true;
    }

    if (this.audibleSince === null) this.audibleSince = now;
    const settling = now - this.audibleSince < WARMUP_MS;

    // Measured before the baseline absorbs this frame, so a beat is judged
    // against where the track was, not against itself.
    const excess = energy - this.baseline;

    // A fast baseline during warm-up follows the opening ramp instead of
    // reading it as signal, which keeps the deviation estimate honest.
    const baselineTau = settling ? WARMUP_TAU_MS : BASELINE_TAU_MS;
    this.baseline += (1 - Math.exp(-dt / baselineTau)) * excess;
    const swing = Math.abs(excess);
    const deviationTau =
      swing > this.deviation ? DEVIATION_RISE_TAU_MS : DEVIATION_FALL_TAU_MS;
    this.deviation += (1 - Math.exp(-dt / deviationTau)) * (swing - this.deviation);

    if (settling) return false;

    const threshold = Math.max(
      MIN_EXCESS,
      this.deviation * THRESHOLD_K * this.sensitivity,
    );

    // Edge-triggered, not level-triggered: a beat is the moment the signal
    // crosses the bar, and it cannot fire again until the signal has dropped
    // back under. Without this, one kick held above the bar reports a beat on
    // every frame it stays there.
    if (excess <= threshold) {
      this.armed = true;
      return false;
    }

    if (!this.armed) return false;
    if (now - this.lastBeatAt < REFRACTORY_MS) return false;

    this.armed = false;
    this.lastBeatAt = now;
    return true;
  }
}
