import { describe, expect, it } from "vitest";
import { detectHdrPreflight, needsHdrCompositingWorkaround } from "./hdr-capabilities";

describe("needsHdrCompositingWorkaround", () => {
  it.each([153, 154, 155, 156])("targets macOS Chromium %i", major => {
    expect(needsHdrCompositingWorkaround(`Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/${major}.0.0.0 Safari/537.36`)).toBe(true);
  });
  it.each([
    "", "Mozilla/5.0 (Macintosh) Version/26.0 Safari/605.1.15",
    "Mozilla/5.0 (Macintosh) Chrome/152.0.0.0",
    "Mozilla/5.0 (Macintosh) Chrome/157.0.8092.0",
    "Mozilla/5.0 (Macintosh) Chrome/158.0.0.0",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/155.0.0.0",
    "Mozilla/5.0 (X11; Linux x86_64) Chrome/155.0.0.0",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) CriOS/155.0.0.0 Mobile/15E148 Safari/604.1",
  ])("does not add a workaround for %s", ua => {
    expect(needsHdrCompositingWorkaround(ua)).toBe(false);
  });
  it("uses Chromium's version for macOS derivative browsers", () => {
    expect(needsHdrCompositingWorkaround("Mozilla/5.0 (Macintosh) Chrome/155.0.0.0 Safari/537.36 Edg/155.0.0.0")).toBe(true);
    expect(needsHdrCompositingWorkaround("Mozilla/5.0 (Macintosh) Chromium/155.0.0.0")).toBe(true);
  });
});

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
