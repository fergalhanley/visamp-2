import { describe, expect, it } from "vitest";
import { shouldPresentHdr2D } from "./hdr-2d-presentation";
import type { HdrScene } from "./webgpu-hdr-renderer";

const frame = (colors: Array<[number, number, number, number]>): HdrScene => ({
  clear: [0, 0, 0, 1],
  triangles: colors.map(color => ({ vertices: [0, 0, 1, 0, 0, 1], color })),
});

describe("automatic HDR 2D canvas handoff", () => {
  it("keeps SDR visible for an empty or SDR-only frame", () => {
    expect(shouldPresentHdr2D(frame([]))).toBe(false);
    expect(shouldPresentHdr2D(frame([[1, 1, 1, 1]]))).toBe(false);
  });
  it("promotes a complete HDR-bright frame", () => {
    expect(shouldPresentHdr2D(frame([[0.8, 2.5, 0.3, 1]]))).toBe(true);
  });
  it("does not use alpha to trigger HDR", () => {
    expect(shouldPresentHdr2D(frame([[0.7, 0.5, 0.4, 4]]))).toBe(false);
  });
});
