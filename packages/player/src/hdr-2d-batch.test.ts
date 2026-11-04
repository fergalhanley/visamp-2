import { expect, it } from "vitest";
import { HdrGeometryBatch, INSTANCE_FLOATS } from "./hdr-2d-batch";
import type { HdrCommand } from "./hdr-2d-frame";
const paint = { transform: [1, 0, 0, 1, 0, 0] as [number, number, number, number, number, number], color: [1, 0, 0, 0.25] as [number, number, number, number], intensity: 4, blend: "alpha" as const, gradient: null };
function line(): Extract<HdrCommand, { kind: "path" }> {
  return { ...paint, kind: "path", points: [[10, 20], [110, 20]], closed: false, rotation: 0, pivot: [10, 20], stroke: { width: 0.2, cap: "butt", join: "bevel" } };
}
it("preserves thin line width, HDR colour and independent alpha", () => {
  const batch = new HdrGeometryBatch();
  expect(batch.append(line(), 640, 360)).toBe(true);
  const d = [...batch.data.subarray(0, INSTANCE_FLOATS)];
  expect(d.slice(0, 2)).toEqual([10, expect.closeTo(19.9, 4)]);
  expect(d.slice(6, 8)).toEqual([100, expect.closeTo(0.2, 6)]);
  expect(d.slice(8, 12)).toEqual([1, 0, 0, 0.25]);
  expect(d.slice(12)).toEqual([1, 1]);
});
it("composes shape rotation and affine transforms in the same order as Canvas2D", () => {
  const batch = new HdrGeometryBatch();
  const c = line(); c.rotation = Math.PI / 2; c.transform = [2, 0, 0, 3, 7, 11];
  batch.append(c, 640, 360);
  expect(batch.data[0]).toBeCloseTo(27.2, 4);
  expect(batch.data[1]).toBeCloseTo(71, 4);
  expect(batch.data[2]).toBeCloseTo(0); expect(batch.data[3]).toBeCloseTo(3);
  expect(batch.data[4]).toBeCloseTo(-2); expect(batch.data[5]).toBeCloseTo(0);
  expect(batch.data[12]).toBeCloseTo(1 / 3); expect(batch.data[13]).toBeCloseTo(1 / 2);
});
it("accepts rectangles but defers concave paths, gradients and destination-dependent blends", () => {
  const batch = new HdrGeometryBatch();
  const rect = { ...line(), closed: true, stroke: null, points: [[0, 0], [80, 0], [80, 40], [0, 40]] as [number, number][] };
  expect(batch.append(rect, 640, 360)).toBe(true);
  expect(batch.append({ ...rect, points: [[0, 0], [80, 0], [10, 10], [0, 40]] }, 640, 360)).toBe(false);
  expect(batch.append({ ...rect, points: [[0, 0], [0, 0], [80, 40], [0, 40]] }, 640, 360)).toBe(false);
  expect(batch.append({ ...line(), points: [[0, 0], [0, 0], [80, 40]] }, 640, 360)).toBe(false);
  expect(batch.append({ ...line(), blend: "multiply" }, 640, 360)).toBe(false);
  expect(batch.append({ ...line(), gradient: { axis: [0, 0, 100, 0], radius: null, stops: [[0, [1, 1, 1, 1]]] } }, 640, 360)).toBe(false);
  expect(batch.append({ ...line(), stroke: { width: 1, cap: "round", join: "round" } }, 640, 360)).toBe(false);
  expect(batch.count).toBe(1);
});
it("supports mirrored rectangles and square caps without adding draw calls", () => {
  const batch = new HdrGeometryBatch(); const c = line();
  c.transform = [-1, 0, 0, 1, 0, 0]; c.stroke = { width: 4, cap: "square", join: "bevel" };
  batch.append(c, 640, 360);
  expect(batch.data[0]).toBe(-8); expect(batch.data[1]).toBe(18);
  expect(batch.data[6]).toBe(104); expect(batch.data[7]).toBe(4);
});
it("skips only empty butt-capped lines, preserving other degenerate paths for rasterisation", () => {
  const batch = new HdrGeometryBatch();
  const c = { ...line(), points: [[0, 0], [0, 0]] as [number, number][] };
  expect(batch.append(c, 640, 360)).toBe(true);
  expect(batch.count).toBe(0);
  expect(batch.append({ ...c, stroke: { width: 1, cap: "square", join: "bevel" } }, 640, 360)).toBe(false);
});
