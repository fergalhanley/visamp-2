import type { ModulationConfig } from "../packages/player/src/lfo-modulation";

// A visualisation can persist these as { source, modulation } in its own record.
// Phase 1 defines this boundary without changing editor/database persistence.
export const source = `prop rotation = 0.0
prop zoom = 1.0
render {
  draw::background(color: $COLOR_BLACK)
  draw::rect(x: $WIDTH / 2 - 90 * zoom, y: $HEIGHT / 2 - 40 * zoom,
    width: 180 * zoom, height: 80 * zoom,
    rotation_rad: rotation, color: $COLOR_TURQUOISE)
}`;
export const modulation: ModulationConfig = {
  version: 1, bpm: 120, beatsPerBar: 4,
  lfos: Array.from({ length: 4 }, (_, i) => ({
    id: `lfo-${i + 1}`, waveform: i === 1 ? "triangle" : "sine",
    barsPerCycle: i === 1 ? 2 : 1, phase: 0, polarity: "bipolar", enabled: i < 2, seed: i + 1,
  })),
  routes: [
    { lfoId: "lfo-1", property: "rotation", min: -0.8, max: 0.8, enabled: true },
    { lfoId: "lfo-2", property: "zoom", min: 0.5, max: 1.5, enabled: true },
  ],
};
