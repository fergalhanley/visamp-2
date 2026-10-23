import { describe, expect, it } from "vitest";
import { packHdrTriangles, type HdrScene } from "./webgpu-hdr-renderer";

describe("packHdrTriangles", () => {
  it("packs three vertices and preserves RGB values above one", () => {
    const scene: HdrScene = {
      clear: [0, 0, 0, 1],
      triangles: [{
        vertices: [-1, -1, 1, -1, 0, 1],
        color: [2.5, 0.4, 0, 1],
      }],
    };
    expect(Array.from(packHdrTriangles(scene))).toEqual([
      -1, -1, 2.5, Math.fround(0.4), 0, 1,
      1, -1, 2.5, Math.fround(0.4), 0, 1,
      0, 1, 2.5, Math.fround(0.4), 0, 1,
    ]);
  });
  it("scales RGB HDR intensity without scaling alpha", () => {
    const scene: HdrScene = {
      clear: [0, 0, 0, 1],
      triangles: [{ vertices: [-1, -1, 1, -1, 0, 1], color: [1, 0.5, 0.25, 0.75] }],
    };
    expect(Array.from(packHdrTriangles(scene, 4).slice(2, 6))).toEqual([4, 2, 1, 0.75]);
    expect(() => packHdrTriangles(scene, 7)).toThrow();
  });
  it("accepts an empty scene", () => {
    expect(packHdrTriangles({ clear: [0, 0, 0, 1], triangles: [] }).length).toBe(0);
  });
  it("rejects nonfinite and negative colour components", () => {
    expect(() => packHdrTriangles({
      clear: [0, 0, 0, 1],
      triangles: [{ vertices: [0, 0, 1, 0, 0, 1], color: [Infinity, 0, 0, 1] }],
    })).toThrow();
    expect(() => packHdrTriangles({
      clear: [0, 0, 0, 1],
      triangles: [{ vertices: [0, 0, 1, 0, 0, 1], color: [-1, 0, 0, 1] }],
    })).toThrow();
  });
});
