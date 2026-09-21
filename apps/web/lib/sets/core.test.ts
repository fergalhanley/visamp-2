import { describe, it, expect } from "vitest";
import {
  emptySet,
  parseSet,
  validate,
  duration,
  transitions,
  type Clip,
} from "./model";
import { schedule, visualFallback, history } from "./scheduler";
import { SetTransport } from "./transport";
const clip = (id: string, startMs = 0, durationMs = 10000): Clip => ({
  id,
  media: {
    id,
    kind: "audio",
    source: "hosted",
    title: id,
    attribution: "Artist",
    durationMs: 20000,
  },
  startMs,
  durationMs,
  sourceOffsetMs: 0,
  fadeInMs: 0,
  fadeOutMs: 0,
});
function fixture() {
  const s = emptySet();
  s.audioClips = transitions([clip("a"), clip("b", 8000)]);
  s.visualClips = s.audioClips.map((c) => ({
    ...c,
    id: "v" + c.id,
    media: { ...c.media, kind: "visual", source: "visual" },
  }));
  return s;
}
describe("set scheduling", () => {
  it("uses half-open endpoints and source offsets", () => {
    const s = fixture();
    s.audioClips[1]!.sourceOffsetMs = 2000;
    expect(schedule(s, 8000).audio.map((x) => x.sourceMs)).toEqual([
      8000, 2000,
    ]);
    expect(schedule(s, 10000).audio.map((x) => x.clip.id)).toEqual(["b"]);
    expect(schedule(s, 18000).audio).toEqual([]);
    expect(duration(s)).toBe(18000);
  });
  it("equal-power and linear fades reconstruct at every seek position", () => {
    const s = fixture();
    for (const [t, p] of [
      [8000, 0],
      [9000, 0.5],
      [9999, 0.9995],
    ]) {
      const a = schedule(s, t!).audio;
      expect(a[0]!.level).toBeCloseTo(Math.cos((p! * Math.PI) / 2));
      expect(a[1]!.level).toBeCloseTo(Math.sin((p! * Math.PI) / 2));
      expect(a.reduce((sum, x) => sum + x.level * x.level, 0)).toBeCloseTo(1);
      const v = schedule(s, t!).visual;
      expect(v[1]!.level).toBeCloseTo(p!);
    }
    expect(visualFallback(schedule(s, 9000).visual)?.level).toBe(0);
  });
  it("finds boundaries, silence and black in gaps", () => {
    const s = fixture();
    s.audioClips = [clip("a", 1000, 1000)];
    s.visualClips = [];
    expect(schedule(s, 500).audio).toEqual([]);
    expect(schedule(s, 500).visual).toEqual([]);
    expect(schedule(s, 500).nextBoundary).toBe(1000);
  });
});
describe("validation and drafts", () => {
  it("validates empty lanes, name and gaps", () => {
    const s = emptySet();
    s.name = " ";
    expect(validate(s).filter((x) => x.severity === "error")).toHaveLength(3);
    const f = fixture();
    f.audioClips = [clip("a", 1000)];
    expect(validate(f).some((x) => x.code === "gap")).toBe(true);
  });
  it("blocks missing content, bad offsets and nested/triple overlaps", () => {
    const s = fixture();
    expect(
      validate(s, { a: "Unavailable" }).some((x) => x.code === "unavailable"),
    ).toBe(true);
    s.audioClips[0]!.sourceOffsetMs = 15000;
    expect(validate(s).some((x) => x.code === "offset")).toBe(true);
    s.audioClips.push(clip("c", 8500, 1000));
    expect(validate(s).some((x) => x.code === "overlap")).toBe(true);
  });
  it("rejects malformed data but retains repairable invalid durations", () => {
    const s = fixture();
    s.audioClips[0]!.durationMs = -1;
    expect(validate(parseSet(s)).some((x) => x.code === "timing")).toBe(true);
    expect(() => parseSet({ ...s, loop: "yes" })).toThrow();
    s.audioClips[0]!.startMs = Infinity;
    expect(() => parseSet(s)).toThrow();
  });
  it("clears generated transition fades when overlap is removed", () => {
    const s = fixture();
    const next = transitions(
      s.audioClips.map((c) => (c.id === "b" ? { ...c, startMs: 12000 } : c)),
      s.audioClips,
    );
    expect(next[0]!.fadeOutMs).toBe(0);
    expect(next[1]!.fadeInMs).toBe(0);
  });
});
it("undo/redo retains add, move, trim, transition and remove states", () => {
  let h = { past: [], present: emptySet(), future: [] } as Parameters<
    typeof history
  >[0];
  const edits = [
    fixture(),
    { ...fixture(), audioClips: [clip("a", 2000, 5000)] },
    emptySet(),
  ];
  for (const value of edits) h = history(h, { type: "edit", value });
  for (const expected of [edits[1], edits[0], emptySet()]) {
    h = history(h, { type: "undo" });
    expect(h.present).toEqual(expected);
  }
  for (const expected of edits) {
    h = history(h, { type: "redo" });
    expect(h.present).toEqual(expected);
  }
});
it("transport freezes load, retains overrides across boundaries, rejoins current time and loops", () => {
  let now = 0;
  const t = new SetTransport(() => now);
  const s = fixture();
  t.load(s);
  s.audioClips = [];
  t.play();
  now = 9000;
  t.override("audio", clip("override").media);
  expect(t.tick().audio[1]!.sourceMs).toBe(1000);
  now = 12000;
  t.tick();
  expect(t.state.audioOverride?.media.id).toBe("override");
  t.override("audio", null);
  expect(t.tick().audio[0]!.sourceMs).toBe(4000);
  t.state.loop = true;
  now = 19000;
  expect(t.tick().timeMs).toBe(1000);
  t.pause();
  now = 22000;
  expect(t.time()).toBe(1000);
  t.stop();
  expect(t.time()).toBe(0);
});

it("pauses override source time and retains it through looping and snapshot recovery", () => {
  let now = 0;
  const t = new SetTransport(() => now);
  t.load(fixture());
  t.state.loop = true;
  t.play();
  now = 16000;
  t.override("audio", clip("override").media);
  now = 19000;
  t.pause();
  expect(t.state.audioOverride?.positionMs).toBe(3000);
  expect(t.time()).toBe(1000);
  now = 25000;
  t.tick();
  expect(t.state.audioOverride?.positionMs).toBe(3000);
  const restored = new SetTransport(() => now);
  restored.restore(t.snapshot());
  restored.play();
  now = 27000;
  restored.tick();
  expect(restored.state.audioOverride?.positionMs).toBe(5000);
  restored.stop();
  expect(restored.state.stopped).toBe(true);
  expect(restored.state.audioOverride).toBeNull();
});
it("loading history cannot undo to an unrelated blank document", () => {
  const h = history(
    { past: [emptySet()], present: emptySet(), future: [] },
    { type: "reset", value: fixture() },
  );
  expect(history(h, { type: "undo" })).toEqual(h);
});
