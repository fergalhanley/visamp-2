import { describe, expect, it } from "vitest";
import { defaultModulationConfig, evaluateLfo, resolveModulatedProperties, validateModulation } from "./lfo-modulation";

const baseLfo = defaultModulationConfig().lfos[0]!;

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
    config.lfos[0]!.enabled = true;
    config.routes = [{ lfoId: "lfo-1", property: "rotation", min: -90, max: 90, enabled: true }];
    const base = Object.freeze({ rotation: 0, zoom: 1 });
    const values = resolveModulatedProperties(base, config, 500);
    expect(values).toEqual({ rotation: 90, zoom: 1 });
    expect(base.rotation).toBe(0);
  });

  it("ignores disabled routes and rejects invalid configurations", () => {
    const config = defaultModulationConfig();
    config.lfos[0]!.enabled = true;
    config.routes = [{ lfoId: "lfo-1", property: "rotation", min: -90, max: 90, enabled: false }];
    expect(resolveModulatedProperties({ rotation: 20 }, config, 500).rotation).toBe(20);
    config.routes[0]!.lfoId = "missing";
    expect(() => validateModulation(config)).toThrow(/missing LFO/);
  });
});

describe("routing and validation boundaries", () => {
  const routed = () => {
    const c = defaultModulationConfig(); c.lfos[0]!.enabled = true;
    c.routes = [{ lfoId: "lfo-1", property: "x", min: -10, max: 10, enabled: true }];
    return c;
  };
  it("ignores zero depth entirely, including clamping", () => {
    const c = routed(); c.routes[0]!.min = c.routes[0]!.max = 0;
    expect(resolveModulatedProperties({ x: 50 }, c, 500)).toEqual({ x: 50 });
  });
  it("sums offsets then clamps the intersection, rejecting conflicting active ranges", () => {
    const c = routed(); c.routes.push({ ...c.routes[0]!, min: 0, max: 20 });
    expect(resolveModulatedProperties({ x: 0 }, c, 500).x).toBe(10);
    expect(resolveModulatedProperties({ x: 0 }, c, 1500).x).toBe(0);
    c.routes[1]!.min = 11;
    expect(() => validateModulation(c)).toThrow(/Conflicting/);
    c.routes[1]!.enabled = false;
    expect(resolveModulatedProperties({ x: 0 }, c, 1500).x).toBe(-10);
  });
  it("uses both polarities to cover the same route depth", () => {
    const c = routed(); const bipolar = resolveModulatedProperties({ x: 2 }, c, 1500);
    c.lfos[0]!.polarity = "unipolar";
    expect(resolveModulatedProperties({ x: 2 }, c, 1500)).toEqual(bipolar);
  });
  it("is deterministic across cadence, paused reads, negative seeks and tempo changes", () => {
    const c = routed(); c.lfos[0]!.waveform = "sample-hold";
    const at = (t: number) => resolveModulatedProperties({ x: 0 }, c, t).x;
    expect(at(-2000)).toBe(at(-1)); expect(at(1999)).not.toBe(at(2000));
    const saved = at(500); for (const t of [0, 17, 44, 2000, 50000, -50]) at(t);
    expect(at(500)).toBe(saved); expect(at(500)).toBe(saved);
    c.bpm = 60; expect(at(1000)).toBe(saved);
    c.lfos[0]!.seed = 4; expect(at(1000)).not.toBe(saved);
  });
  it("rejects invalid JSON shapes, flags, versions, seeds, routes and unsafe time", () => {
    for (const value of [null, [], {}, { ...routed(), version: 2 }, { ...routed(), routes: null }, { ...routed(), bpm: Infinity }, { ...routed(), unknown: true }]) expect(() => validateModulation(value)).toThrow();
    for (const seed of [-1, 0.5, 2 ** 32, NaN]) {
      const c = routed(); c.lfos[0]!.seed = seed; expect(() => validateModulation(c)).toThrow(/seed/);
    }
    const badFlag = { ...routed(), routes: [{ ...routed().routes[0], enabled: "yes" }] };
    expect(() => validateModulation(badFlag)).toThrow();
    const tooMany = routed(); tooMany.routes = Array.from({ length: 65 }, () => tooMany.routes[0]!);
    expect(() => validateModulation(tooMany)).toThrow(/64/);
    expect(() => resolveModulatedProperties({}, routed(), 0)).toThrow(/numeric property/);
    expect(() => resolveModulatedProperties({ x: NaN }, routed(), 0)).toThrow(/numeric property/);
    expect(() => resolveModulatedProperties({ x: 0 }, routed(), Number.MAX_VALUE)).toThrow(/safe cycle/);
    expect(() => resolveModulatedProperties({ x: 0 }, routed(), NaN)).toThrow(/timing/);
  });
  it("does not resolve inherited object names as numeric properties", () => {
    const c = routed(); c.routes[0]!.property = "toString";
    expect(() => resolveModulatedProperties({}, c, 0)).toThrow(/numeric property/);
  });
});
