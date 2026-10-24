/**
 * Deterministic, renderer-independent LFO modulation primitives.
 * All evaluation is a pure function of timeline time and configuration.
 */
export type LfoWaveform = "sine" | "triangle" | "square" | "saw-up" | "saw-down" | "sample-hold";
export type LfoPolarity = "bipolar" | "unipolar";
export interface LfoConfig {
  id: string;
  waveform: LfoWaveform;
  /** One oscillator cycle every N bars. Supports fractional bars (e.g. 1/16). */
  barsPerCycle: number;
  phase: number;
  polarity: LfoPolarity;
  enabled: boolean;
  /** Stable integer seed for sample-and-hold. */
  seed: number;
}
export interface ModulationRoute {
  lfoId: string;
  property: string;
  min: number;
  max: number;
  enabled: boolean;
}
export interface ModulationConfig {
  bpm: number;
  beatsPerBar: number;
  lfos: LfoConfig[];
  routes: ModulationRoute[];
}
export const MAX_LFOS = 4;
const TAU = 2 * Math.PI;
const fract = (value: number) => value - Math.floor(value);
const isFinitePositive = (value: number) => Number.isFinite(value) && value > 0;

export function validateModulation(config: ModulationConfig): void {
  if (!isFinitePositive(config.bpm) || !isFinitePositive(config.beatsPerBar)) {
    throw new Error("BPM and beats per bar must be positive finite values");
  }
  if (config.lfos.length > MAX_LFOS) throw new Error(`At most ${MAX_LFOS} LFOs are supported`);
  const ids = new Set<string>();
  for (const lfo of config.lfos) {
    if (!lfo.id || ids.has(lfo.id)) throw new Error("LFO IDs must be nonempty and unique");
    ids.add(lfo.id);
    if (!isFinitePositive(lfo.barsPerCycle) || lfo.barsPerCycle < 1 / 16 || lfo.barsPerCycle > 16) {
      throw new Error("LFO cycle length must be between 1/16 and 16 bars");
    }
    if (!Number.isFinite(lfo.phase) || !Number.isFinite(lfo.seed)) throw new Error("Invalid LFO phase or seed");
    if (!["sine", "triangle", "square", "saw-up", "saw-down", "sample-hold"].includes(lfo.waveform)) {
      throw new Error("Unknown LFO waveform");
    }
    if (lfo.polarity !== "bipolar" && lfo.polarity !== "unipolar") throw new Error("Unknown LFO polarity");
  }
  for (const route of config.routes) {
    if (!ids.has(route.lfoId)) throw new Error(`Route references missing LFO: ${route.lfoId}`);
    if (!route.property || !Number.isFinite(route.min) || !Number.isFinite(route.max) || route.min > route.max) {
      throw new Error("Invalid modulation route");
    }
  }
}

/** Stable integer hash; no Math.random() or frame-dependent state. */
function heldRandom(cycle: number, seed: number): number {
  let x = (Math.trunc(cycle) ^ Math.trunc(seed)) | 0;
  x = Math.imul(x ^ (x >>> 16), 0x7feb352d);
  x = Math.imul(x ^ (x >>> 15), 0x846ca68b);
  return ((x ^ (x >>> 16)) >>> 0) / 0x100000000;
}

export function evaluateLfo(lfo: LfoConfig, timeMs: number, bpm: number, beatsPerBar = 4): number {
  if (!Number.isFinite(timeMs) || !isFinitePositive(bpm) || !isFinitePositive(beatsPerBar) || !isFinitePositive(lfo.barsPerCycle)) {
    throw new Error("Invalid LFO timing");
  }
  if (!lfo.enabled) return 0;
  const cycles = (timeMs * bpm) / (60_000 * beatsPerBar * lfo.barsPerCycle) + lfo.phase;
  const t = fract(cycles);
  let unit: number;
  switch (lfo.waveform) {
    case "sine": unit = (1 + Math.sin(TAU * t)) / 2; break;
    case "triangle": unit = 1 - Math.abs(2 * t - 1); break;
    case "square": unit = t < 0.5 ? 1 : 0; break;
    case "saw-up": unit = t; break;
    case "saw-down": unit = 1 - t; break;
    case "sample-hold": unit = heldRandom(Math.floor(cycles), lfo.seed); break;
    default: throw new Error("Unsupported waveform");
  }
  return lfo.polarity === "bipolar" ? 2 * unit - 1 : unit;
}

/**
 * Routes values to numeric properties, preserving caller-owned base values.
 * Routes combine additively as offsets from their midpoint, then clamp to
 * the intersection of the target route ranges. Disabled LFOs contribute zero.
 */
export function resolveModulatedProperties(
  base: Readonly<Record<string, number>>,
  config: ModulationConfig,
  timeMs: number,
): Record<string, number> {
  validateModulation(config);
  const result = { ...base };
  const byId = new Map(config.lfos.map((lfo) => [lfo.id, lfo]));
  const grouped = new Map<string, ModulationRoute[]>();
  for (const route of config.routes) {
    if (!route.enabled || !(route.property in base) || !Number.isFinite(base[route.property])) continue;
    grouped.set(route.property, [...(grouped.get(route.property) ?? []), route]);
  }
  for (const [property, routes] of grouped) {
    let value = base[property];
    let low = -Infinity, high = Infinity;
    let active = false;
    for (const route of routes) {
      const lfo = byId.get(route.lfoId)!;
      if (!lfo.enabled) continue;
      const sample = evaluateLfo(lfo, timeMs, config.bpm, config.beatsPerBar);
      const bipolar = lfo.polarity === "bipolar" ? sample : 2 * sample - 1;
      value += bipolar * (route.max - route.min) / 2;
      low = Math.max(low, route.min);
      high = Math.min(high, route.max);
      active = true;
    }
    if (active) result[property] = low <= high ? Math.min(high, Math.max(low, value)) : value;
  }
  return result;
}

export function defaultModulationConfig(bpm = 120): ModulationConfig {
  return {
    bpm,
    beatsPerBar: 4,
    lfos: Array.from({ length: MAX_LFOS }, (_, index) => ({
      id: `lfo-${index + 1}`,
      waveform: "sine" as const,
      barsPerCycle: 1,
      phase: 0,
      polarity: "bipolar" as const,
      enabled: false,
      seed: index + 1,
    })),
    routes: [],
  };
}
