/** Versioned, deterministic modulation. The engine uses the same contract and
 * evaluates it on its existing frame clock; this evaluator is for host previews. */
export type LfoWaveform = "sine" | "triangle" | "square" | "saw-up" | "saw-down" | "sample-hold";
export type LfoPolarity = "bipolar" | "unipolar";
export interface LfoConfig {
  id: string;
  waveform: LfoWaveform;
  /** One cycle every N bars, including fractional bars. */
  barsPerCycle: number;
  /** Phase in cycles. Integer phase also advances sample-and-hold's step. */
  phase: number;
  polarity: LfoPolarity;
  enabled: boolean;
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
  version: 1;
  bpm: number;
  beatsPerBar: number;
  lfos: LfoConfig[];
  routes: ModulationRoute[];
}
export const MAX_LFOS = 4;
export const MAX_MODULATION_ROUTES = 64;
const positive = (n: number) => Number.isFinite(n) && n > 0;
const waveforms = ["sine", "triangle", "square", "saw-up", "saw-down", "sample-hold"];
function object(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      Object.keys(value).some(key => !keys.includes(key))) throw new Error("Invalid modulation object");
  return value as Record<string, unknown>;
}
function name(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z_][A-Za-z0-9_-]{0,127}$/.test(value);
}
function validateLfo(value: unknown): asserts value is LfoConfig {
  const lfo = object(value, ["id", "waveform", "barsPerCycle", "phase", "polarity", "enabled", "seed"]);
  if (!name(lfo.id)) throw new Error("Invalid LFO ID");
  if (typeof lfo.barsPerCycle !== "number" || !Number.isFinite(lfo.barsPerCycle) || lfo.barsPerCycle < 1 / 16 || lfo.barsPerCycle > 16) throw new Error("LFO cycle length must be between 1/16 and 16 bars");
  if (typeof lfo.phase !== "number" || !Number.isFinite(lfo.phase) || Math.abs(lfo.phase) > Number.MAX_SAFE_INTEGER) throw new Error("Invalid LFO phase");
  if (typeof lfo.seed !== "number" || !Number.isInteger(lfo.seed) || lfo.seed < 0 || lfo.seed > 0xffffffff) throw new Error("LFO seed must be a uint32 integer");
  if (!waveforms.includes(lfo.waveform as string)) throw new Error("Unknown LFO waveform");
  if (lfo.polarity !== "bipolar" && lfo.polarity !== "unipolar") throw new Error("Unknown LFO polarity");
  if (typeof lfo.enabled !== "boolean") throw new Error("Invalid LFO enabled flag");
}
/** Also validates untrusted JSON before it crosses the WASM boundary. */
export function validateModulation(value: unknown): asserts value is ModulationConfig {
  const config = object(value, ["version", "bpm", "beatsPerBar", "lfos", "routes"]);
  if (config.version !== 1) throw new Error("Unsupported modulation version");
  if (typeof config.bpm !== "number" || !positive(config.bpm) || typeof config.beatsPerBar !== "number" || !positive(config.beatsPerBar)) throw new Error("BPM and beats per bar must be positive finite values");
  if (!Array.isArray(config.lfos) || config.lfos.length > MAX_LFOS) throw new Error(`At most ${MAX_LFOS} LFOs are supported`);
  if (!Array.isArray(config.routes) || config.routes.length > MAX_MODULATION_ROUTES) throw new Error(`At most ${MAX_MODULATION_ROUTES} routes are supported`);
  const ids = new Map<string, LfoConfig>();
  for (const lfo of config.lfos) {
    validateLfo(lfo);
    if (ids.has(lfo.id)) throw new Error("LFO IDs must be unique");
    ids.set(lfo.id, lfo);
  }
  const bounds = new Map<string, [number, number]>();
  for (const item of config.routes) {
    const route = object(item, ["lfoId", "property", "min", "max", "enabled"]);
    const lfo = ids.get(route.lfoId as string);
    if (!lfo) throw new Error(`Route references missing LFO: ${String(route.lfoId)}`);
    if (!name(route.property) || typeof route.min !== "number" || typeof route.max !== "number" || !Number.isFinite(route.min) || !Number.isFinite(route.max) || route.min > route.max || typeof route.enabled !== "boolean") throw new Error("Invalid modulation route");
    // A zero-depth route is an identity, including when base lies outside its bounds.
    if (!route.enabled || !lfo.enabled || route.min === route.max) continue;
    const previous = bounds.get(route.property) ?? [-Infinity, Infinity];
    const low = Math.max(previous[0], route.min), high = Math.min(previous[1], route.max);
    if (low > high) throw new Error(`Conflicting modulation ranges for ${route.property}`);
    bounds.set(route.property, [low, high]);
  }
}
function heldRandom(cycle: number, seed: number): number {
  let x = (cycle ^ seed) | 0;
  x = Math.imul(x ^ (x >>> 16), 0x7feb352d);
  x = Math.imul(x ^ (x >>> 15), 0x846ca68b);
  return ((x ^ (x >>> 16)) >>> 0) / 0x100000000;
}
export function evaluateLfo(lfo: LfoConfig, timeMs: number, bpm: number, beatsPerBar = 4): number {
  validateLfo(lfo);
  if (!Number.isFinite(timeMs) || !positive(bpm) || !positive(beatsPerBar)) throw new Error("Invalid LFO timing");
  if (!lfo.enabled) return 0;
  const cycles = (timeMs / 60_000) * (bpm / beatsPerBar) / lfo.barsPerCycle + lfo.phase;
  if (!Number.isFinite(cycles) || Math.abs(cycles) > Number.MAX_SAFE_INTEGER) throw new Error("LFO timeline exceeds safe cycle range");
  const t = cycles - Math.floor(cycles);
  let unit: number;
  switch (lfo.waveform) {
    case "sine": unit = (1 + Math.sin(2 * Math.PI * t)) / 2; break;
    case "triangle": unit = 1 - Math.abs(2 * t - 1); break;
    case "square": unit = t < 0.5 ? 1 : 0; break;
    case "saw-up": unit = t; break;
    case "saw-down": unit = 1 - t; break;
    case "sample-hold": unit = heldRandom(Math.floor(cycles), lfo.seed); break;
  }
  return lfo.polarity === "bipolar" ? 2 * unit - 1 : unit;
}
/** Midpoint-relative additive offsets, then clamp to active ranges' intersection.
 * Both polarities span the same route depth. No route writes to base values. */
export function resolveModulatedProperties(base: Readonly<Record<string, number>>, config: ModulationConfig, timeMs: number): Record<string, number> {
  validateModulation(config);
  if (!Number.isFinite(timeMs)) throw new Error("Invalid LFO timing");
  const result = { ...base };
  const samples = new Map(config.lfos.map(lfo => [lfo.id, { lfo, sample: evaluateLfo(lfo, timeMs, config.bpm, config.beatsPerBar) }]));
  const grouped = new Map<string, { offset: number; low: number; high: number }>();
  for (const route of config.routes) {
    if (!Object.hasOwn(base, route.property) || typeof base[route.property] !== "number" || !Number.isFinite(base[route.property])) throw new Error(`Modulation requires a finite numeric property: ${route.property}`);
    const { lfo, sample } = samples.get(route.lfoId)!;
    if (!route.enabled || !lfo.enabled || route.min === route.max) continue;
    const group = grouped.get(route.property) ?? { offset: 0, low: -Infinity, high: Infinity };
    const bipolar = lfo.polarity === "bipolar" ? sample : 2 * sample - 1;
    group.offset += bipolar * (route.max / 2 - route.min / 2);
    group.low = Math.max(group.low, route.min); group.high = Math.min(group.high, route.max);
    if (!Number.isFinite(group.offset)) throw new Error("Modulation offset overflow");
    grouped.set(route.property, group);
  }
  for (const [property, group] of grouped) {
    result[property] = Math.min(group.high, Math.max(group.low, base[property]! + group.offset));
  }
  return result;
}
export function defaultModulationConfig(bpm = 120): ModulationConfig {
  return {
    version: 1, bpm, beatsPerBar: 4,
    lfos: Array.from({ length: MAX_LFOS }, (_, index) => ({ id: `lfo-${index + 1}`, waveform: "sine", barsPerCycle: 1, phase: 0, polarity: "bipolar", enabled: false, seed: index + 1 })),
    routes: [],
  };
}

/** Configure once on changes; the engine evaluates it before every frame.
 * Invalid configurations throw and leave the engine's previous bank intact. */
export function configureModulation(engine: { set_modulation_config(payload: string): void }, config: ModulationConfig | null): void {
  if (config !== null) validateModulation(config);
  engine.set_modulation_config(JSON.stringify(config));
}
