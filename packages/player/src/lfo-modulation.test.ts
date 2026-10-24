import { describe, expect, it } from "vitest";
import { defaultModulationConfig, evaluateLfo, resolveModulatedProperties, validateModulation } from "./lfo-modulation";

const baseLfo = defaultModulationConfig().lfos[0];

describe("LFO modulation", () => {
  it("generates four disabled oscillators by default", () => {
    const config = defaultModulationConfig();
    expect(config.lfos).toHaveLength(4);
    expect(config.lfos.every((lfo) => !lfo.enabled)).toBe(true);
    expect(() => validateModulation(config)).not.toThrow();
  });

  it("synchronises waveforms with musical time rather than frame count", () => {
    const lfo = { ...baseLfo, waveform: "sine" as const, enabled: true };
    // 120 BPM, four beats per bar -> 2 seconds per cycle.
    expect(evaluateLfo(lfo, 0, 120)).toBeCloseTo(0);
    expect(evaluateLfo(lfo, 500, 120)).toBeCloseTo(1);
    expect(evaluateLfo(lfo, 1500, 120)).toBeCloseTo(-1);
    expect(evaluateLfo(lfo, 2000, 120)).toBeCloseTo(0);
  });

  it("supports triangle, square, rising/falling saw and unipolar output", () => {
    const lfo = { ...baseLfo, enabled: true, polarity: "unipolar" as const };
    expect(evaluateLfo({ ...lfo, waveform: "triangle" }, 1000, 120)).toBeCloseTo(1);
    expect(evaluateLfo({ ...lfo, waveform: "square" }, 1200, 120)).toBe(0);
    expect(evaluateLfo({ ...lfo, waveform: "saw-up" }, 500, 120)).toBeCloseTo(0.25);
    expect(evaluateLfo({ ...lfo, waveform: "saw-down" }, 500, 120)).toBeCloseTo(0.75);
  });

  it("honours phase and musical divisions", () => {
    const lfo = { ...baseLfo, enabled: true, waveform: "sine" as const, barsPerCycle: 0.5, phase: 0.25 };
    expect(evaluateLfo(lfo, 0, 120)).toBeCloseTo(1);
    expect(evaluateLfo(lfo, 1000, 120)).toBeCloseTo(1);
  });

  it("holds random values throughout each cycle, reproducibly", () => {
    const lfo = { ...baseLfo, enabled: true, waveform: "sample-hold" as const };
    expect(evaluateLfo(lfo, 10, 120)).toBe(evaluateLfo(lfo, 1900, 120));
    expect(evaluateLfo(lfo, 2100, 120)).toBe(evaluateLfo(lfo, 2100, 120));
  });

  it("modulates without mutating the script's base property values", () => {
    const config = defaultModulationConfig();
    config.lfos[0].enabled = true;
    config.routes = [{ lfoId: "lfo-1", property: "rotation", min: -90, max: 90, enabled: true }];
    const base = Object.freeze({ rotation: 0, zoom: 1 });
    const values = resolveModulatedProperties(base, config, 500);
    expect(values).toEqual({ rotation: 90, zoom: 1 });
    expect(base.rotation).toBe(0);
  });

  it("ignores disabled routes and rejects invalid configurations", () => {
    const config = defaultModulationConfig();
    config.lfos[0].enabled = true;
    config.routes = [{ lfoId: "lfo-1", property: "rotation", min: -90, max: 90, enabled: false }];
    expect(resolveModulatedProperties({ rotation: 20 }, config, 500).rotation).toBe(20);
    config.routes[0].lfoId = "missing";
    expect(() => validateModulation(config)).toThrow(/missing LFO/);
  });
});
