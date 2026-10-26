import { describe, expect, it } from "vitest";
import { detectHdrPreflight } from "./hdr-capabilities";

describe("detectHdrPreflight", () => {
  it("does not assume HDR when there is no browser", () => {
    expect(detectHdrPreflight({})).toEqual({
      supportedDisplay: false, webgpuAvailable: false, eligible: false, reason: "no-webgpu",
    });
  });
  it("requires both WebGPU and a high dynamic range display", () => {
    expect(detectHdrPreflight({ navigator: { gpu: {} }, matchMedia: () => ({ matches: true }) })).toMatchObject({
      eligible: true, reason: "eligible",
    });
    expect(detectHdrPreflight({ navigator: { gpu: {} }, matchMedia: () => ({ matches: false }) })).toMatchObject({
      eligible: false, reason: "no-hdr-display",
    });
    expect(detectHdrPreflight({ navigator: {}, matchMedia: () => ({ matches: true }) })).toMatchObject({
      eligible: false, reason: "no-webgpu",
    });
  });
  it("fails closed when the browser media query throws", () => {
    expect(detectHdrPreflight({ navigator: { gpu: {} }, matchMedia: () => { throw Error("unsupported"); } }).eligible).toBe(false);
  });
});
