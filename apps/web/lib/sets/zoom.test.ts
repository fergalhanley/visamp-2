import { describe, expect, it } from "vitest";
import { visibleTimelineMs } from "./zoom";
describe("timeline zoom", () => {
  it.each([
    [0, 90],
    [25, 30],
    [50, 10],
    [75, 3],
    [100, 1],
  ])("shows %s%% as %s minutes", (percent, minutes) => {
    expect(visibleTimelineMs(percent)).toBeCloseTo(minutes * 60000);
  });
  it("interpolates continuously and clamps to the supported range", () => {
    expect(visibleTimelineMs(12.5)).toBeCloseTo(Math.sqrt(90 * 30) * 60000);
    expect(visibleTimelineMs(-10)).toBe(5400000);
    expect(visibleTimelineMs(110)).toBe(60000);
    for (let n = 1; n <= 100; n++)
      expect(visibleTimelineMs(n)).toBeLessThan(visibleTimelineMs(n - 1));
  });
});
