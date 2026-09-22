import type { TransportState } from "./transport";
import { schedule, visualFallback, type Scheduled } from "./scheduler";
import type { TitleProperties } from "./title-properties";
export type TitleOverlay = {
  id: string;
  kind: "audio" | "visual";
  title: string;
  attribution: string;
  position: TitleProperties["position"];
  size: TitleProperties["size"];
};
/** Use set time (not audio source offset or wall time), so pause and seek are exact. */
export function titleOverlays(state: TransportState): TitleOverlay[] {
  if (state.complete || state.stopped) return [];
  const current = schedule(state.set, state.positionMs);
  // During transitions, identify the dominant audio and the rendered visual.
  const audio = current.audio.reduce<Scheduled | null>(
    (best, item) => (!best || item.level >= best.level ? item : best),
    null,
  );
  const visual = visualFallback(current.visual);
  return [
    state.audioOverride ? null : audio,
    state.visualOverride ? null : visual,
  ].flatMap((item) => {
    if (!item) return [];
    const { clip } = item;
    const p = clip.titleProperties;
    const elapsed = state.positionMs - clip.startMs;
    if (
      !p?.enabled ||
      elapsed < p.startMs ||
      elapsed >= p.startMs + p.durationMs
    )
      return [];
    return [
      {
        id: clip.id,
        kind: clip.media.kind,
        title: clip.media.title,
        attribution: p.showAttribution ? clip.media.attribution : "",
        position: p.position,
        size: p.size,
      },
    ];
  });
}
