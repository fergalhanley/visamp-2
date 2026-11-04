/**
 * Experimental 2D WebGPU tessellation. Coordinates are Canvas2D pixel units,
 * converted to clip space. Existing Canvas2D remains the production renderer.
 * The shapes are untextured, opaque fills only; no silent claim of full parity.
 */
import type { HdrScene, HdrTriangle } from "./webgpu-hdr-renderer";

export type Hdr2DShape =
  | { kind: "rect"; x: number; y: number; width: number; height: number; color: readonly [number, number, number, number]; intensity?: number }
  | { kind: "circle"; x: number; y: number; radius: number; color: readonly [number, number, number, number]; intensity?: number };

export type Hdr2DFrame = {
  width: number;
  height: number;
  clear?: readonly [number, number, number, number];
  shapes: readonly Hdr2DShape[];
};

export function tessellateHdr2D(frame: Hdr2DFrame): HdrScene {
  if (![frame.width, frame.height].every(v => Number.isFinite(v) && v > 0))
    throw new Error("2D HDR requires positive canvas dimensions");
  if (frame.shapes.length > 2048) throw new Error("2D HDR shape limit exceeded");
  const triangles: HdrTriangle[] = [];
  const p = (x: number, y: number): [number, number] =>
    [(x / frame.width) * 2 - 1, 1 - (y / frame.height) * 2];
  for (const shape of frame.shapes) {
    const intensity = shape.intensity ?? 1;
    if (!Number.isFinite(intensity) || intensity < 0 || intensity > 6 ||
        shape.color.some(v => !Number.isFinite(v) || v < 0) ||
        !Number.isFinite(shape.x) || !Number.isFinite(shape.y))
      throw new Error("Invalid 2D HDR shape");
    const color: HdrTriangle["color"] = [
      shape.color[0] * intensity, shape.color[1] * intensity,
      shape.color[2] * intensity, shape.color[3]
    ];
    const add = (a: [number, number], b: [number, number], c: [number, number]) =>
      triangles.push({ vertices: [...a, ...b, ...c] as HdrTriangle["vertices"], color });
    if (shape.kind === "rect") {
      if (![shape.width, shape.height].every(v => Number.isFinite(v) && v >= 0)) throw new Error("Invalid 2D rectangle");
      const a = p(shape.x, shape.y);
      const b = p(shape.x + shape.width, shape.y);
      const c = p(shape.x + shape.width, shape.y + shape.height);
      const d = p(shape.x, shape.y + shape.height);
      add(a, b, c); add(a, c, d);
    } else {
      if (!Number.isFinite(shape.radius) || shape.radius < 0) throw new Error("Invalid 2D circle");
      const centre = p(shape.x, shape.y);
      const steps = 48;
      for (let i = 0; i < steps; i++) {
        const a = i * Math.PI * 2 / steps;
        const b = (i + 1) * Math.PI * 2 / steps;
        add(centre, p(shape.x + Math.cos(a) * shape.radius, shape.y + Math.sin(a) * shape.radius),
          p(shape.x + Math.cos(b) * shape.radius, shape.y + Math.sin(b) * shape.radius));
      }
    }
  }
  return { clear: frame.clear ?? [0, 0, 0, 1], triangles };
}
