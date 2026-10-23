/** Version 2 wire contract. All coordinates use engine canvas pixels. */
export type Rgba = [number, number, number, number];
export type Point = [number, number];
export type Blend = "alpha" | "additive" | "multiply" | "none";
export type Gradient = { axis: Rgba; radius: number | null; stops: [number, Rgba][] };
type Paint = {
  transform: [number, number, number, number, number, number];
  blend: Blend; intensity: number; color: Rgba; gradient: Gradient | null;
};
export type HdrCommand = { kind: "clear" } | (Paint & (
  | { kind: "background" }
  | { kind: "path"; points: Point[]; closed: boolean; pivot: Point; rotation: number;
      stroke: { width: number; cap: CanvasLineCap; join: "round" | "bevel" } | null }
  | { kind: "text"; text: string; font: string; position: Point }
  | { kind: "image"; asset: string; rect: Rgba; opacity: number }
));
export type HdrEffect = { kind: number; amount: number; params: number[]; color: Rgba; asset: string | null };
export type HdrFrame = {
  version: 2; sequence: number; width: number; height: number;
  commands: HdrCommand[]; effects: HdrEffect[];
  scramble: { kind: number; refresh: Rgba } | null;
  seconds: number; clearScene: boolean;
};
const fail = (): never => { throw new Error("Invalid HDR 2D command frame"); };
function object(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== "object" || Array.isArray(v)) return fail();
  return v as Record<string, unknown>;
}
function number(v: unknown, min = -Number.MAX_VALUE, max = Number.MAX_VALUE): asserts v is number {
  if (typeof v !== "number" || !Number.isFinite(v) || v < min || v > max) fail();
}
function array(v: unknown, length: number, min?: number, max?: number): asserts v is number[] {
  if (!Array.isArray(v) || v.length !== length) fail();
  for (const n of v as unknown[]) number(n, min, max);
}
function string(v: unknown, max = 65536): asserts v is string {
  if (typeof v !== "string" || v.length > max) fail();
}
/** Fail closed: never display a partially decoded frame over the SDR stage. */
export function decodeHdrFrame(input: unknown): HdrFrame {
  const f = object(input);
  if (f.version !== 2 || typeof f.clearScene !== "boolean") fail();
  number(f.sequence, 0, Number.MAX_SAFE_INTEGER);
  number(f.width, 1, 16384); number(f.height, 1, 16384); number(f.seconds, 0);
  if (![f.width, f.height, f.sequence].every(Number.isInteger)) fail();
  if (!Array.isArray(f.commands) || f.commands.length > 2048 || !Array.isArray(f.effects) || f.effects.length > 32) fail();
  let points = 0;
  for (const value of f.commands as unknown[]) {
    const c = object(value);
    if (c.kind === "clear") continue;
    if (!["path", "background", "text", "image"].includes(String(c.kind))) fail();
    array(c.transform, 6); array(c.color, 4, 0, 1); number(c.intensity, 0, 6);
    if (!["alpha", "additive", "multiply", "none"].includes(String(c.blend))) fail();
    if (c.gradient !== null) {
      const g = object(c.gradient); array(g.axis, 4);
      if (g.radius !== null) number(g.radius, Number.MIN_VALUE);
      if (!Array.isArray(g.stops) || g.stops.length > 4096) fail();
      for (const s of g.stops as unknown[]) {
        if (!Array.isArray(s) || s.length !== 2) fail();
        const stop = s as unknown[]; number(stop[0], 0, 1); array(stop[1], 4, 0, 1);
      }
    }
    if (c.kind === "path") {
      if (!Array.isArray(c.points) || typeof c.closed !== "boolean") fail();
      points += (c.points as unknown[]).length;
      if (points > 65536) fail();
      for (const p of c.points as unknown[]) array(p, 2);
      array(c.pivot, 2); number(c.rotation);
      if (c.stroke !== null) {
        const s = object(c.stroke); number(s.width, Number.MIN_VALUE);
        if (!["butt", "round", "square"].includes(String(s.cap)) || !["round", "bevel"].includes(String(s.join))) fail();
      }
    } else if (c.kind === "text") { string(c.text); string(c.font, 1024); array(c.position, 2); }
    else if (c.kind === "image") { string(c.asset, 1024); array(c.rect, 4); number(c.rect[2], Number.MIN_VALUE); number(c.rect[3], Number.MIN_VALUE); number(c.opacity, 0, 1); }
  }
  for (const value of f.effects as unknown[]) {
    const e = object(value); number(e.kind, 1, 26);
    if (!Number.isInteger(e.kind)) fail();
    number(e.amount); array(e.params, 8); array(e.color, 4, 0, 1);
    if (e.asset !== null) string(e.asset, 1024);
  }
  if (f.scramble !== null) {
    const s = object(f.scramble); number(s.kind, 1, 40);
    if (!Number.isInteger(s.kind)) fail();
    array(s.refresh, 4, 0, 1);
  }
  return input as HdrFrame;
}
