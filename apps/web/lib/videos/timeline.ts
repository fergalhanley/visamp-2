import { emptySet, parseSet, type SetContent } from "@/lib/sets/model";
import type { VideoContent, VideoParamValue } from "./model";

/** The shared timeline edits timing only. Its set-shaped view is never persisted. */
export function videoTimeline(video: VideoContent): SetContent {
  return {
    ...emptySet(),
    audioClips: video.audioClips,
    visualClips: video.visualClips.map((clip) => ({
      ...clip,
      sourceOffsetMs: 0,
    })),
  };
}

export function applyVideoTimeline(
  video: VideoContent,
  timeline: SetContent,
): VideoContent {
  const uses = new Map(video.visualClips.map((clip) => [clip.id, clip]));
  return parseVideo({
    ...video,
    audioClips: timeline.audioClips,
    visualClips: timeline.visualClips.map((clip) => {
      const previous = uses.get(clip.id);
      const sameVisual = previous?.media.id === clip.media.id;
      return {
        ...clip,
        paramValues: sameVisual ? previous.paramValues : {},
        visualLicenceId: sameVisual ? previous.visualLicenceId : undefined,
      };
    }),
  });
}

const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

/** Reuse clip structural validation, but accept only the Video storage contract. */
export function parseVideo(value: unknown): VideoContent {
  if (
    !object(value) ||
    value.schemaVersion !== 1 ||
    !["9:16", "16:9", "1:1"].includes(String(value.aspectRatio)) ||
    !Array.isArray(value.visualClips)
  )
    throw new Error("Invalid video details.");
  const rawVisuals = value.visualClips;
  const timeline = parseSet({
    ...emptySet(),
    schemaVersion: value.schemaVersion,
    audioClips: value.audioClips,
    visualClips: value.visualClips.map((clip: unknown) =>
      object(clip) ? { ...clip, sourceOffsetMs: 0 } : clip,
    ),
  });
  for (const clip of [...timeline.audioClips, ...timeline.visualClips]) {
    if (
      clip.startMs < 0 ||
      clip.durationMs <= 0 ||
      clip.sourceOffsetMs < 0 ||
      clip.fadeInMs < 0 ||
      clip.fadeOutMs < 0 ||
      clip.fadeInMs > clip.durationMs ||
      clip.fadeOutMs > clip.durationMs
    )
      throw new Error("Invalid clip timing.");
  }
  return {
    schemaVersion: 1,
    aspectRatio: value.aspectRatio as VideoContent["aspectRatio"],
    audioClips: timeline.audioClips.map((clip) => {
      if (clip.media.source !== "hosted")
        throw new Error("Video tracks must be hosted music you control.");
      return {
        id: clip.id,
        startMs: clip.startMs,
        durationMs: clip.durationMs,
        sourceOffsetMs: clip.sourceOffsetMs,
        fadeInMs: clip.fadeInMs,
        fadeOutMs: clip.fadeOutMs,
        media: { ...clip.media, kind: "audio", source: "hosted" },
      };
    }),
    visualClips: timeline.visualClips.map((clip, index) => {
      const raw = rawVisuals[index] as Record<string, unknown>;
      if (!object(raw.paramValues) || Object.keys(raw.paramValues).length > 100)
        throw new Error("Invalid visual params.");
      const params: Record<string, VideoParamValue> = {};
      for (const [name, param] of Object.entries(raw.paramValues)) {
        if (
          !/^[A-Z][A-Z0-9_]*$/.test(name) ||
          name.length > 128 ||
          !(
            typeof param === "boolean" ||
            (typeof param === "string" && param.length <= 4000) ||
            (typeof param === "number" && Number.isFinite(param))
          )
        )
          throw new Error("Invalid visual param value.");
        params[name] = param;
      }
      if (
        raw.visualLicenceId !== undefined &&
        (typeof raw.visualLicenceId !== "string" ||
          !/^[\da-f-]{36}$/i.test(raw.visualLicenceId))
      )
        throw new Error("Invalid visual licence reference.");
      return {
        id: clip.id,
        media: { ...clip.media, kind: "visual", source: "visual" },
        startMs: clip.startMs,
        durationMs: clip.durationMs,
        fadeInMs: clip.fadeInMs,
        fadeOutMs: clip.fadeOutMs,
        paramValues: params,
        ...(raw.visualLicenceId
          ? { visualLicenceId: raw.visualLicenceId as string }
          : {}),
      };
    }),
  };
}
