import { describe, expect, it } from "vitest";
import {
  controlForProperty,
  parseMarketplaceControls,
} from "./controls";

describe("marketplace controls", () => {
  it("maps supported Visript properties to control kinds", () => {
    expect(
      controlForProperty({ name: "gain", type: "float", value: "0.5" }),
    ).toEqual({ prop: "gain", label: "gain", kind: "number" });
    expect(
      controlForProperty({
        name: "tint",
        type: "color",
        value: "rgba(1, 0, 0, 1)",
        swatch: "#ff0000",
      }),
    ).toEqual({ prop: "tint", label: "tint", kind: "colour" });
    expect(
      controlForProperty({ name: "points", type: "array", value: "[]" }),
    ).toBeNull();
  });

  it("drops malformed and duplicate stored controls", () => {
    expect(
      parseMarketplaceControls([
        { prop: "gain", label: "Intensity", kind: "number", min: 0, max: 1 },
        { prop: "gain", label: "Duplicate", kind: "number" },
        { prop: "", label: "Bad", kind: "text" },
        { prop: "speed", label: "Speed", kind: "number", step: -1 },
        { prop: "tint", label: "Tint", kind: "colour" },
      ]),
    ).toEqual([
      { prop: "gain", label: "Intensity", kind: "number", min: 0, max: 1 },
      { prop: "speed", label: "Speed", kind: "number" },
      { prop: "tint", label: "Tint", kind: "colour" },
    ]);
  });
});
