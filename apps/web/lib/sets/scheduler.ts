import { type Clip, type SetContent, duration, end, ordered } from "./model";
export type Scheduled = { clip: Clip; level: number; sourceMs: number };
export function laneAt(lane: Clip[], t: number, audio: boolean): Scheduled[] {
  return ordered(lane)
    .filter((c) => c.startMs <= t && t < end(c))
    .map((clip) => {
      const elapsed = t - clip.startMs,
        remaining = end(clip) - t;
      const fadeIn = clip.fadeInMs ? Math.min(1, elapsed / clip.fadeInMs) : 1;
      const fadeOut = clip.fadeOutMs
        ? Math.min(1, remaining / clip.fadeOutMs)
        : 1;
      return {
        clip,
        sourceMs: clip.sourceOffsetMs + elapsed,
        level: audio
          ? Math.sin((fadeIn * Math.PI) / 2) * Math.sin((fadeOut * Math.PI) / 2)
          : fadeIn * fadeOut,
      };
    });
}
export function schedule(s: SetContent, t: number) {
  const all = [...s.audioClips, ...s.visualClips];
  return {
    timeMs: t,
    durationMs: duration(s),
    audio: laneAt(s.audioClips, t, true),
    visual: laneAt(s.visualClips, t, false),
    nextBoundary:
      all
        .flatMap((c) => [
          c.startMs,
          c.startMs + c.fadeInMs,
          end(c) - c.fadeOutMs,
          end(c),
        ])
        .filter((n) => n > t)
        .sort((a, b) => a - b)[0] ?? null,
    nextAudio: ordered(s.audioClips).find((c) => c.startMs > t) ?? null,
    nextVisual: ordered(s.visualClips).find((c) => c.startMs > t) ?? null,
  };
}
/** Single-renderer fallback: fade outgoing to black, then incoming from black. */
export function visualFallback(items: Scheduled[]): Scheduled | null {
  if (items.length < 2) return items[0] ?? null;
  const [a, b] = items;
  return b!.level < 0.5
    ? { ...a!, level: Math.max(0, 1 - 2 * b!.level) }
    : { ...b!, level: Math.max(0, 2 * b!.level - 1) };
}
export type History = {
  past: SetContent[];
  present: SetContent;
  future: SetContent[];
};
export type HistoryAction =
  { type: "edit" | "reset"; value: SetContent } | { type: "undo" | "redo" };
export function history(h: History, a: HistoryAction): History {
  if (a.type === "reset") return { past: [], present: a.value, future: [] };
  if (a.type === "edit")
    return {
      past: [...h.past.slice(-99), h.present],
      present: a.value,
      future: [],
    };
  if (a.type === "undo" && h.past.length)
    return {
      past: h.past.slice(0, -1),
      present: h.past.at(-1)!,
      future: [h.present, ...h.future],
    };
  if (a.type === "redo" && h.future.length)
    return {
      past: [...h.past, h.present],
      present: h.future[0]!,
      future: h.future.slice(1),
    };
  return h;
}
