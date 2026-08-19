import { describe, expect, it } from "vitest";

import { BeatDetector } from "../beat-detector";
import {
  Analyser,
  SAMPLE_RATE,
  frames,
  renderTrack,
  type TrackOptions,
} from "./analyser";

/**
 * Runs the detector over a rendered track and returns the times beats fired.
 *
 * The spectra come from a real FFT of a real waveform, through the same
 * windowing, smoothing and dB mapping the browser applies — so what the
 * detector sees here is what it will see in the page.
 */
function beatTimes(options?: TrackOptions): number[] {
  const detector = new BeatDetector();
  const hits: number[] = [];

  for (const { frequency, now } of frames(renderTrack(options))) {
    if (detector.detect(frequency, now, SAMPLE_RATE)) hits.push(now);
  }

  return hits;
}

function gaps(hits: number[]): number[] {
  return hits.slice(1).map((t, i) => t - hits[i]!);
}

function median(values: number[]): number {
  return [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]!;
}

describe("BeatDetector", () => {
  it("keeps detecting for as long as the track plays", () => {
    // The reported failure: beats register at the start and then stop.
    // Counting per second is what catches that; a total alone would not.
    const hits = beatTimes({ seconds: 20 });

    const perSecond = Array.from({ length: 20 }, (_, s) =>
      hits.filter((t) => t >= s * 1000 && t < (s + 1) * 1000).length,
    );

    // 120bpm is two kicks a second. The first second is allowed to settle.
    expect(Math.min(...perSecond.slice(1))).toBeGreaterThanOrEqual(1);
    expect(Math.max(...perSecond)).toBeLessThanOrEqual(3);
  });

  it("locks to the kick rather than free-running", () => {
    expect(median(gaps(beatTimes({ seconds: 12 })))).toBeGreaterThan(400);
    expect(median(gaps(beatTimes({ seconds: 12 })))).toBeLessThan(600);
  });

  it("follows a faster tempo", () => {
    const g = median(gaps(beatTimes({ seconds: 12, kickIntervalMs: 300 })));
    expect(g).toBeGreaterThan(240);
    expect(g).toBeLessThan(360);
  });

  it("follows a slower tempo", () => {
    const g = median(gaps(beatTimes({ seconds: 16, kickIntervalMs: 750 })));
    expect(g).toBeGreaterThan(600);
    expect(g).toBeLessThan(900);
  });

  it("finds beats under a loud, compressed master", () => {
    // Heavy drive and a fat bassline push the spectrum toward the ceiling.
    // This is where a "is this frame a multiple of the recent average" test
    // dies: nothing can be 1.5x an average that is already near the top.
    const hits = beatTimes({ seconds: 12, bassLevel: 0.55, drive: 3.5 });
    expect(hits.length).toBeGreaterThan(15);
    expect(median(gaps(hits))).toBeGreaterThan(400);
    expect(median(gaps(hits))).toBeLessThan(600);
  });

  it("is not thrown off by offbeat hi-hats", () => {
    // Hats land halfway between kicks. Detecting those too would double the
    // rate and put flashes on the offbeat.
    expect(median(gaps(beatTimes({ seconds: 12, hats: true })))).toBeGreaterThan(400);
  });

  it("reports nothing on silence", () => {
    const detector = new BeatDetector();
    const quiet = new Uint8Array(1024);
    let fired = 0;

    for (let n = 0; n < 600; n += 1) {
      if (detector.detect(quiet, n * (1000 / 60), SAMPLE_RATE)) fired += 1;
    }

    expect(fired).toBe(0);
  });

  it("reports nothing when there is no audio at all", () => {
    expect(new BeatDetector().detect(new Uint8Array(0), 0, SAMPLE_RATE)).toBe(false);
  });

  it("does not fire twice for one kick", () => {
    expect(Math.min(...gaps(beatTimes({ seconds: 12 })))).toBeGreaterThan(140);
  });

  it("hears the kick band and not the rest of the spectrum", () => {
    // Same rhythm, same level, different place in the spectrum. A 60Hz thump
    // is a kick; a 4kHz tick is a hi-hat and must not read as one.
    const pulse = (hz: number): number => {
      const samples = new Float64Array(SAMPLE_RATE * 8);
      for (let n = 0; n < samples.length; n += 1) {
        const t = n / SAMPLE_RATE;
        const since = t % 0.5;
        const env = since < 0.2 ? Math.exp(-since * 25) : 0;
        samples[n] = Math.sin(2 * Math.PI * hz * t) * env * 0.8;
      }

      const detector = new BeatDetector();
      let hits = 0;
      for (const { frequency, now } of frames(samples)) {
        if (detector.detect(frequency, now, SAMPLE_RATE)) hits += 1;
      }
      return hits;
    };

    expect(pulse(60)).toBeGreaterThan(8);
    expect(pulse(4000)).toBe(0);
  });

  it("renders a spectrum that actually contains the kick", () => {
    // Guards the harness itself: if the rendered spectrum were silent, every
    // test above would pass vacuously.
    const analyser = new Analyser(renderTrack({ seconds: 2 }));
    const spectrum = analyser.at(SAMPLE_RATE);
    expect(Math.max(...spectrum)).toBeGreaterThan(100);
  });
});
