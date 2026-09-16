import { test } from "node:test";
import assert from "node:assert/strict";
import { AudioAnalysis, FFT_SIZE } from "../public/audio-detect-worklet.mjs";

function run(rate, seconds, signal, quantum = 128) {
  const analysis = new AudioAnalysis(rate);
  const frames = Math.floor(rate * seconds);
  const hits = [];
  for (let start = 0; start < frames; start += quantum) {
    const samples = Float32Array.from(
      { length: Math.min(quantum, frames - start) },
      (_, i) => signal((start + i) / rate),
    );
    analysis.push([samples], samples.length, (state) =>
      hits.push({
        time: state.samples / rate,
        beats: state.beatCount,
        onsets: state.onsetCount,
        strength: state.onsetStrength,
      }),
    );
  }
  return { analysis, hits };
}

test("silence has zero signed waveform, spectrum, level and events", () => {
  const { analysis: a } = run(48000, 1, () => 0);
  assert.equal(a.level, 0);
  assert.equal(a.beatCount, 0);
  assert.equal(a.onsetCount, 0);
  assert.ok(a.waveform.every((v) => v === 0));
  assert.ok(a.spectrum.every((v) => v === 0));
});

test("bin-centred sine has calibrated linear amplitude and RMS at 44.1/48k", () => {
  for (const rate of [44100, 48000]) {
    const hz = (40 * rate) / FFT_SIZE;
    const { analysis: a } = run(
      rate,
      1,
      (t) => 0.8 * Math.sin(2 * Math.PI * hz * t),
      192,
    );
    assert.ok(Math.abs(a.spectrum[40] - 0.8) < 0.001);
    assert.ok(Math.abs(a.level - 0.8 / Math.sqrt(2)) < 0.001);
    assert.ok(a.waveform.some((v) => v < 0) && a.waveform.some((v) => v > 0));
    assert.equal(a.waveform.length, 1024);
    assert.equal(a.spectrum.length, 1024);
    assert.equal(a.beatCount, 0, "continuous tone is not a rhythm");
  }
});

test("recurring bass attacks establish beats, high-frequency attacks only onsets", () => {
  for (const rate of [44100, 48000]) {
    const pulse = (hz) => (t) => {
      const phase = t % 0.5;
      return phase < 0.12
        ? 0.8 * Math.exp(-phase * 25) * Math.sin(2 * Math.PI * hz * t)
        : 0;
    };
    const low = run(rate, 4, pulse(90)).analysis;
    const high = run(rate, 4, pulse(8000)).analysis;
    assert.ok(low.beatCount >= 4, `bass beats ${low.beatCount}`);
    assert.ok(low.onsetCount >= 6, `bass onsets ${low.onsetCount}`);
    assert.equal(high.beatCount, 0);
    assert.ok(high.onsetCount >= 6, `treble onsets ${high.onsetCount}`);
  }
});

test("normalization contains clipped and non-finite inputs and smoothing releases", () => {
  const { analysis: a } = run(48000, 1, () => 3);
  assert.ok(a.level <= 1 && a.spectrum.every((v) => v >= 0 && v <= 1));
  a.push([Float32Array.from({ length: 48000 }, () => NaN)], 48000, () => {});
  assert.ok(a.level < 0.002);
  assert.ok(a.waveform.every((v) => v === 0));
});
