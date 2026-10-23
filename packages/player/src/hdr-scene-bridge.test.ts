import { describe, it, expect } from "vitest";
import { readHdrScene } from "./hdr-scene-bridge";

describe("readHdrScene", () => {
  it("accepts a frame recorded by the WASM scene bridge", () => {
    const result = readHdrScene({
      get_hdr_scene_snapshot: () => JSON.stringify({
        clear: [0, 0, 0, 1],
        triangles: [{ vertices: [0, 0, 1, 0, 0, 1], color: [3, 0, 0, 1] }],
      }),
    });
    expect(result.triangles[0].color[0]).toBe(3);
  });
  it("rejects malformed data", () => {
    expect(() => readHdrScene({ get_hdr_scene_snapshot: () => '{"triangles":[]}' })).toThrow();
  });
});
