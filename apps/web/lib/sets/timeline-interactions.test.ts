import { describe, expect, it } from "vitest";
import {
  anchoredTimelineScroll,
  snapTimelineTime,
} from "./timeline-interactions";

describe("timeline snapping", () => {
  it("prioritises clip edges over whole seconds when zoomed out", () => {
    expect(snapTimelineTime(59000, [60000], 1)).toBe(60000);
    expect(snapTimelineTime(45000, [60000], 1)).toBe(60000);
    expect(snapTimelineTime(45000, [60000], 20)).toBe(45000);
  });
  it("snaps either end of a moved clip and accepts cross-lane boundaries", () => {
    expect(snapTimelineTime(30500, [60000], 10, false, [0, 30000])).toBe(30000);
    expect(snapTimelineTime(59950, [60000], 10)).toBe(60000);
  });
  it("allows a modifier to bypass all snapping", () => {
    expect(snapTimelineTime(59950, [60000], 1, true)).toBe(59950);
  });
});
describe("pointer anchored zoom", () => {
  it("keeps the timestamp under the cursor stationary in both directions", () => {
    const x = 600,
      scroll = 1000,
      before = 180000,
      after = 600000;
    const next = anchoredTimelineScroll(scroll, x, before, after);
    // This zoom reaches the left edge, so the scroll is necessarily clamped.
    expect(next).toBe(0);
    const expanded = anchoredTimelineScroll(4000, x, before, after);
    expect((expanded + x) * after).toBe((4000 + x) * before);
    expect(anchoredTimelineScroll(expanded, x, after, before)).toBe(4000);
  });
});

it("quantises fractional playhead snapping for moves and both trim edges", () => {
  for (const disabled of [false, true]) {
    for (const offsets of [[0], [0, 30000]]) {
      for (const time of [12345.678, 42345.678, 59999.999]) {
        expect(
          Number.isSafeInteger(
            snapTimelineTime(
              time,
              [12345.678, 59999.999],
              10,
              disabled,
              offsets,
            ),
          ),
        ).toBe(true);
      }
    }
  }
  expect(snapTimelineTime(12345, [12345.678], 10)).toBe(12346);
  expect(snapTimelineTime(12345, [42345.678], 10, false, [0, 30000])).toBe(
    12346,
  );
});
