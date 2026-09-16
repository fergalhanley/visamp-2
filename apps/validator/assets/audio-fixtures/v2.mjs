export const REFERENCE_SCRIPT_VERSION = "v2";
export const AUDIO_FIXTURE_SET_VERSION = "v2";

// Deterministic normalized snapshots for the audio::detect host contract.
const timeDomainLength = 1024;
const frequencyLength = 1024;

function fixture(key, kind, sample) {
  return {
    key,
    kind,
    frames: Array.from({ length: 8 }, (_, frame) => ({
      sampleRate: 48000,
      level: Math.sqrt(Array.from({ length: timeDomainLength }, (_, i) => sample(frame, i / timeDomainLength) ** 2).reduce((a, b) => a + b, 0) / timeDomainLength),
      beat: frame % 4 === 0,
      onset: frame % 2 === 0,
      onsetStrength: frame % 2 === 0 ? 0.75 : 0.0,
      waveform: Array.from({ length: timeDomainLength }, (_, i) =>
        sample(frame, i / timeDomainLength),
      ),
      spectrum: Array.from({ length: frequencyLength }, (_, i) =>
        Math.max(0, sample(frame, i / frequencyLength)),
      ),
    })),
  };
}

export const AUDIO_FIXTURES = Object.freeze([
  fixture("sine-sweep", "synthetic", (frame, x) =>
    Math.sin((x * (2 + frame * 2) + frame / 8) * Math.PI * 2),
  ),
  fixture("impulse-train", "synthetic", (frame, x) =>
    (Math.floor(x * 32) + frame) % 8 === 0 ? 1 : 0,
  ),
  fixture("original-music-loop", "original", (frame, x) => {
    const beat = frame % 2 === 0 ? Math.exp(-x * 18) : 0;
    const bass = Math.sin((x * 3 + frame / 8) * Math.PI * 2) * 0.45;
    const chord = (Math.sin(x * 17 * Math.PI * 2) + Math.sin(x * 23 * Math.PI * 2)) * 0.18;
    return Math.max(-1, Math.min(1, beat + bass + chord));
  }),
]);
