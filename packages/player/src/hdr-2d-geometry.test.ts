import { describe, expect, it } from "vitest";
import { tessellateHdr2D } from "./hdr-2d-geometry";

describe("tessellateHdr2D", () => {
  it("converts a top-left rectangle and preserves extended RGB separately from alpha", () => {
    const scene = tessellateHdr2D({ width: 100, height: 100, shapes: [{
      kind: "rect", x: 0, y: 0, width: 50, height: 50,
      color: [0.5, 0.25, 0, 0.7], intensity: 4,
    }] });
    expect(scene.triangles).toHaveLength(2);
    expect(scene.triangles[0].vertices).toEqual([-1, 1, 0, 1, 0, 0]);
    expect(scene.triangles[0].color).toEqual([2, 1, 0, 0.7]);
  });
  it("tessellates circles to triangles", () => {
    expect(tessellateHdr2D({ width: 200, height: 100, shapes: [{
      kind: "circle", x: 100, y: 50, radius: 20, color: [1, 0, 0, 1],
    }] }).triangles).toHaveLength(48);
  });
  it("rejects bad dimensions and out-of-range intensity", () => {
    expect(() => tessellateHdr2D({ width: 0, height: 100, shapes: [] })).toThrow();
    expect(() => tessellateHdr2D({ width: 100, height: 100, shapes: [{
      kind: "circle", x: 0, y: 0, radius: 10, intensity: 7, color: [1, 1, 1, 1],
    }] })).toThrow();
  });
});
