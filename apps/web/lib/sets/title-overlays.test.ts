import { describe, expect, it } from "vitest";
import { emptySet, parseSet, type Clip } from "./model";
import {
  defaultTitleProperties,
  parseTitleProperties,
} from "./title-properties";
import { titleOverlays } from "./title-overlays";
import { SetTransport } from "./transport";
import { parseState } from "./protocol";
const clip = (kind: "audio" | "visual"): Clip => ({
  id: kind,
  media: {
    id: kind,
    kind,
    source: kind === "audio" ? "hosted" : "visual",
    title: `${kind} title`,
    attribution: "Creator",
  },
  startMs: 10000,
  sourceOffsetMs: kind === "audio" ? 45000 : 0,
  durationMs: 20000,
  fadeInMs: 0,
  fadeOutMs: 0,
  titleProperties: {
    ...defaultTitleProperties,
    enabled: true,
    startMs: 2000,
    durationMs: 5000,
  },
});
function transport() {
  const t = new SetTransport(() => 0);
  t.load({
    ...emptySet(),
    audioClips: [clip("audio")],
    visualClips: [clip("visual")],
  });
  return t;
}
describe("clip title persistence and validation", () => {
  it("preserves title properties through set and output snapshot parsing", () => {
    const t = transport();
    expect(parseSet(t.state.set).audioClips[0]!.titleProperties).toEqual(
      clip("audio").titleProperties,
    );
    expect(
      parseState(t.snapshot())?.set.visualClips[0]!.titleProperties,
    ).toEqual(clip("visual").titleProperties);
  });
  it("keeps old sets valid and their titles disabled", () => {
    const t = transport();
    delete t.state.set.visualClips[0]!.titleProperties;
    delete t.state.set.audioClips[0]!.titleProperties;
    t.seek(12000);
    expect(() => parseSet(t.state.set)).not.toThrow();
    expect(titleOverlays(t.state)).toEqual([]);
  });
  it.each([
    { startMs: -1 },
    { startMs: 0.1 },
    { durationMs: 0 },
    { durationMs: Infinity },
    { position: "Outside" },
    { size: "huge" },
    { enabled: "yes" },
    { showAttribution: null },
  ])("rejects invalid settings %j", (invalid) => {
    expect(() =>
      parseTitleProperties({ ...defaultTitleProperties, ...invalid }),
    ).toThrow();
    const t = transport();
    const bad = {
      ...t.state.set,
      visualClips: [
        {
          ...clip("visual"),
          titleProperties: { ...defaultTitleProperties, ...invalid },
        },
      ],
    };
    expect(() => parseSet(bad)).toThrow();
  });
});
describe("title timing", () => {
  it("uses clip-relative time independent of source offset, with exact half-open boundaries", () => {
    const t = transport();
    t.seek(11999);
    expect(titleOverlays(t.state)).toEqual([]);
    t.seek(12000);
    expect(titleOverlays(t.state)).toHaveLength(2);
    t.seek(16999);
    expect(titleOverlays(t.state)).toHaveLength(2);
    t.seek(17000);
    expect(titleOverlays(t.state)).toEqual([]);
    t.seek(12000);
    t.play();
    t.pause();
    expect(titleOverlays(t.state)).toHaveLength(2);
    t.stop();
    expect(titleOverlays(t.state)).toEqual([]);
  });
  it("ends titles at clip end and respects per-lane overrides and attribution", () => {
    const t = transport();
    t.state.set.audioClips[0]!.titleProperties!.durationMs = 90000;
    t.state.set.audioClips[0]!.titleProperties!.showAttribution = false;
    t.seek(12000);
    t.override("visual", clip("visual").media);
    expect(titleOverlays(t.state)).toMatchObject([
      { kind: "audio", attribution: "" },
    ]);
    t.override("visual", null);
    expect(titleOverlays(t.state)).toHaveLength(2);
    t.seek(29999);
    expect(titleOverlays(t.state)).toHaveLength(1);
    t.seek(30000);
    expect(titleOverlays(t.state)).toEqual([]);
  });
});
