import { describe, expect, it } from "vitest";
import { defaultModulationConfig } from "@visamp/player";
import { readStoredModulation } from "./modulation";

describe("stored visualisation modulation", () => {
  it("accepts an old visualisation without modulation", () => {
    expect(readStoredModulation(null)).toBeNull();
    expect(readStoredModulation(undefined)).toBeNull();
  });
  it("preserves a versioned configuration through JSON persistence", () => {
    const config = defaultModulationConfig(96);
    config.lfos[0]!.enabled = true;
    config.routes = [{ lfoId: "lfo-1", property: "rotation", min: -2, max: 2, enabled: true }];
    expect(readStoredModulation(JSON.parse(JSON.stringify(config)))).toEqual(config);
  });
  it("rejects unknown versions or malformed route targets without crashing", () => {
    const config = defaultModulationConfig();
    expect(readStoredModulation({ ...config, version: 99 })).toBeNull();
    expect(readStoredModulation({ ...config, routes: [
      { lfoId: "missing", property: "angle", min: -1, max: 1, enabled: true },
    ] })).toBeNull();
  });
});
