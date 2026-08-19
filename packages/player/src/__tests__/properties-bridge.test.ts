import { afterEach, describe, expect, it, vi } from "vitest";

import { startPropertiesBridge } from "../properties-bridge";
import type { EngineModule, PropertyView } from "../types";

/**
 * Drives the bridge frame by frame. The real one is `requestAnimationFrame`;
 * here it is a queue we step by hand so the tests are deterministic.
 */
function fakeFrames() {
  let pending: FrameRequestCallback | null = null;
  let now = 0;
  let handle = 0;

  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    pending = cb;
    return (handle += 1);
  });
  vi.stubGlobal("cancelAnimationFrame", () => {
    pending = null;
  });

  return {
    /** Advances one frame at 60fps. */
    step(frames = 1) {
      for (let n = 0; n < frames; n += 1) {
        const cb = pending;
        pending = null;
        now += 1000 / 60;
        cb?.(now);
      }
    },
  };
}

/** An engine whose properties are whatever the supplied function returns. */
function engineReturning(properties: () => PropertyView[]): EngineModule {
  return {
    get_properties: () => JSON.stringify(properties()),
  } as unknown as EngineModule;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("startPropertiesBridge", () => {
  it("catches a value that is true for a single frame", () => {
    // The reported symptom: `gotBeat = $BEAT` never appeared true, because
    // `$BEAT` lasts one frame in thirty and the panel sampled far more slowly.
    let frame = 0;
    const engine = engineReturning(() => [
      { name: "gotBeat", type: "boolean", value: frame % 30 === 0 ? "true" : "false" },
    ]);

    const seen: string[] = [];
    const frames = fakeFrames();
    const stop = startPropertiesBridge(engine, (properties) => {
      seen.push(properties[0]!.value);
    });

    for (let n = 0; n < 300; n += 1) {
      frame = n;
      frames.step();
    }
    stop();

    expect(seen).toContain("true");
  });

  it("holds a value long enough to read before replacing it", () => {
    let tick = 0;
    const engine = engineReturning(() => [
      { name: "angle", type: "float", value: String(tick) },
    ]);

    const at: number[] = [];
    let elapsed = 0;
    const frames = fakeFrames();
    const stop = startPropertiesBridge(engine, () => at.push(elapsed));

    for (let n = 0; n < 120; n += 1) {
      tick = n;
      elapsed = n * (1000 / 60);
      frames.step();
    }
    stop();

    // Two seconds of a value changing every frame must not become 120 renders.
    expect(at.length).toBeLessThan(15);
    const gaps = at.slice(1).map((t, i) => t - at[i]!);
    expect(Math.min(...gaps)).toBeGreaterThanOrEqual(250 - 1000 / 60);
  });

  it("replaces the panel at once when the script's properties change shape", () => {
    // A recompile is a different script, not a new value, so it must not wait
    // out a dwell that belongs to the properties it replaced.
    let names = ["a"];
    const engine = engineReturning(() =>
      names.map((name) => ({ name, type: "integer", value: "1" })),
    );

    const reports: string[][] = [];
    const frames = fakeFrames();
    const stop = startPropertiesBridge(engine, (properties) =>
      reports.push(properties.map((p) => p.name)),
    );

    frames.step();
    names = ["a", "b"];
    frames.step();
    stop();

    expect(reports.at(-1)).toEqual(["a", "b"]);
  });

  it("keeps the last good list when the engine returns nonsense", () => {
    let payload = '[{"name":"a","type":"integer","value":"1"}]';
    const engine = { get_properties: () => payload } as unknown as EngineModule;

    const reports: PropertyView[][] = [];
    const frames = fakeFrames();
    const stop = startPropertiesBridge(engine, (properties) => reports.push(properties));

    frames.step();
    payload = "not json";
    frames.step(10);
    stop();

    expect(reports).toHaveLength(1);
    expect(reports[0]![0]!.name).toBe("a");
  });
});
