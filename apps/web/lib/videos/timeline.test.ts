import { expect, it } from "vitest";
import { emptyVideo, type VideoContent } from "./model";
import { applyVideoTimeline, parseVideo, videoTimeline } from "./timeline";
import { history } from "@/lib/sets/scheduler";

const video = (): VideoContent => ({
  ...emptyVideo(),
  visualClips: [
    {
      id: "first-use",
      media: {
        id: "visual",
        kind: "visual",
        source: "visual",
        title: "Visual",
        attribution: "Creator",
      },
      startMs: 0,
      durationMs: 30000,
      fadeInMs: 0,
      fadeOutMs: 0,
      paramValues: { INTENSITY: 0.7, HELLO: "hello", ACTIVE: true },
      visualLicenceId: "11111111-1111-4111-8111-111111111111",
    },
    {
      id: "second-use",
      media: {
        id: "visual",
        kind: "visual",
        source: "visual",
        title: "Visual",
        attribution: "Creator",
      },
      startMs: 30000,
      durationMs: 30000,
      fadeInMs: 0,
      fadeOutMs: 0,
      paramValues: { INTENSITY: 0.2 },
    },
  ],
});

it("preserves each use's params, licence and format through editing, saving and reloading", () => {
  const original = video();
  const timeline = videoTimeline(original);
  timeline.visualClips[0] = {
    ...timeline.visualClips[0]!,
    startMs: 1000,
    durationMs: 10000,
  };
  const saved = parseVideo(
    JSON.parse(JSON.stringify(applyVideoTimeline(original, timeline))),
  );
  expect(saved.aspectRatio).toBe("9:16");
  expect(saved.visualClips[0]).toMatchObject({
    startMs: 1000,
    durationMs: 10000,
    paramValues: original.visualClips[0]!.paramValues,
    visualLicenceId: original.visualClips[0]!.visualLicenceId,
  });
  expect(saved.visualClips[1]!.paramValues).toEqual({ INTENSITY: 0.2 });
  expect(saved).not.toHaveProperty("loop");
  expect(saved.visualClips[0]).not.toHaveProperty("sourceOffsetMs");
  expect(original.visualClips[0]!.startMs).toBe(0);
});
it("does not transfer overrides or licensing to a replacement visual", () => {
  const original = video();
  const timeline = videoTimeline(original);
  timeline.visualClips[0] = {
    ...timeline.visualClips[0]!,
    media: { ...timeline.visualClips[0]!.media, id: "replacement" },
  };
  const changed = applyVideoTimeline(original, timeline);
  expect(changed.visualClips[0]!.paramValues).toEqual({});
  expect(changed.visualClips[0]).not.toHaveProperty("visualLicenceId");
});
it("rejects unsupported audio sources, duplicate IDs, malformed params and timing", () => {
  for (const source of ["file", "soundcloud", "visual"])
    expect(() =>
      parseVideo({
        ...emptyVideo(),
        audioClips: [
          {
            ...videoTimeline(video()).visualClips[0],
            media: {
              id: "track",
              title: "Track",
              attribution: "Artist",
              kind: "audio",
              source,
            },
          },
        ],
      }),
    ).toThrow();
  const duplicate = video();
  duplicate.visualClips[1]!.id = "first-use";
  expect(() => parseVideo(duplicate)).toThrow(/unique/);
  for (const paramValues of [
    { lower: 1 },
    { VALUE: {} },
    { VALUE: Infinity },
  ]) {
    const invalid = video();
    Object.assign(invalid.visualClips[0]!, { paramValues });
    expect(() => parseVideo(invalid)).toThrow(/param/);
  }
  for (const durationMs of [-1, 0, 1.5, Infinity]) {
    const invalid = video();
    invalid.visualClips[0]!.durationMs = durationMs;
    expect(() => parseVideo(invalid)).toThrow();
  }
});
it("shared undo restores the full Video rather than only its timeline view", () => {
  const original = video();
  const changed = { ...original, aspectRatio: "1:1" as const, visualClips: [] };
  const edited = history(
    { past: [], present: original, future: [] },
    { type: "edit", value: changed },
  );
  expect(history(edited, { type: "undo" }).present).toEqual(original);
  expect(
    history(history(edited, { type: "undo" }), { type: "redo" }).present,
  ).toEqual(changed);
});
