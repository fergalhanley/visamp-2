import { parseTitleProperties, type TitleProperties } from "./title-properties";
/** Serializable programme references. Source payloads and playback URLs stay out of storage. */
export type MediaRef = {
  id: string;
  kind: "audio" | "visual";
  source: "hosted" | "soundcloud" | "file" | "visual";
  title: string;
  attribution: string;
  durationMs?: number;
  revisionId?: string;
};
export type Clip = {
  titleProperties?: TitleProperties;
  id: string;
  media: MediaRef;
  startMs: number;
  durationMs: number;
  sourceOffsetMs: number;
  fadeInMs: number;
  fadeOutMs: number;
};
export type SetContent = {
  schemaVersion: 1;
  name: string;
  description: string;
  loop: boolean;
  aspectRatio: "16:9";
  audioClips: Clip[];
  visualClips: Clip[];
};
export type SetDocument = SetContent & {
  id: string;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
};
export type SetRow = {
  id: string;
  owner_id: string;
  content: SetContent;
  created_at: string;
  updated_at: string;
};
export type Issue = {
  severity: "error" | "warning";
  code: string;
  message: string;
  clipId?: string;
};
export const emptySet = (): SetContent => ({
  schemaVersion: 1,
  name: "Untitled set",
  description: "",
  loop: false,
  aspectRatio: "16:9",
  audioClips: [],
  visualClips: [],
});
export const fromRow = (r: SetRow): SetDocument => ({
  ...r.content,
  id: r.id,
  ownerId: r.owner_id,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});
export const clips = (s: SetContent) => [...s.audioClips, ...s.visualClips];
export const end = (c: Clip) => c.startMs + c.durationMs;
export const duration = (s: SetContent) =>
  clips(s).reduce((n, c) => Math.max(n, end(c)), 0);
export const ordered = (lane: Clip[]) =>
  [...lane].sort(
    (a, b) =>
      a.startMs - b.startMs || end(a) - end(b) || a.id.localeCompare(b.id),
  );
const record = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const text = (v: unknown, max: number) =>
  typeof v === "string" && v.length <= max;
/** Structural parsing is distinct from readiness: invalid drafts must remain repairable. */
export function parseSet(value: unknown): SetContent {
  if (
    !record(value) ||
    value.schemaVersion !== 1 ||
    value.aspectRatio !== "16:9" ||
    typeof value.loop !== "boolean" ||
    !text(value.name, 160) ||
    !text(value.description, 4000)
  )
    throw new Error("Invalid set details.");
  const parseLane = (raw: unknown, kind: "audio" | "visual"): Clip[] => {
    if (!Array.isArray(raw) || raw.length > 1000)
      throw new Error("Invalid clip list (maximum 1,000 per lane).");
    return raw.map((c) => {
      if (!record(c) || !text(c.id, 128) || !c.id || !record(c.media))
        throw new Error("Invalid clip.");
      const m = c.media;
      if (
        m.kind !== kind ||
        !text(m.id, 256) ||
        !m.id ||
        !text(m.title, 500) ||
        !text(m.attribution, 500) ||
        !(kind === "visual"
          ? m.source === "visual"
          : ["hosted", "soundcloud", "file"].includes(String(m.source)))
      )
        throw new Error("Invalid content reference.");
      if (m.revisionId !== undefined && !text(m.revisionId, 128))
        throw new Error("Invalid revision.");
      if (
        m.durationMs !== undefined &&
        (!Number.isSafeInteger(m.durationMs) || Number(m.durationMs) <= 0)
      )
        throw new Error("Invalid source duration.");
      for (const k of [
        "startMs",
        "durationMs",
        "sourceOffsetMs",
        "fadeInMs",
        "fadeOutMs",
      ])
        if (!Number.isSafeInteger(c[k]))
          throw new Error("Timing must use whole milliseconds.");
      if (!Number.isSafeInteger(Number(c.startMs) + Number(c.durationMs)))
        throw new Error("Timing exceeds supported range.");
      return {
        id: c.id as string,
        media: {
          id: m.id as string,
          kind,
          source: m.source as MediaRef["source"],
          title: m.title as string,
          attribution: m.attribution as string,
          ...(m.durationMs !== undefined
            ? { durationMs: m.durationMs as number }
            : {}),
          ...(m.revisionId ? { revisionId: m.revisionId as string } : {}),
        },
        startMs: c.startMs as number,
        durationMs: c.durationMs as number,
        sourceOffsetMs: c.sourceOffsetMs as number,
        fadeInMs: c.fadeInMs as number,
        fadeOutMs: c.fadeOutMs as number,
        ...(c.titleProperties !== undefined
          ? { titleProperties: parseTitleProperties(c.titleProperties) }
          : {}),
      };
    });
  };
  const result: SetContent = {
    schemaVersion: 1,
    name: value.name as string,
    description: value.description as string,
    loop: value.loop,
    aspectRatio: "16:9",
    audioClips: parseLane(value.audioClips, "audio"),
    visualClips: parseLane(value.visualClips, "visual"),
  };
  if (new Set(clips(result).map((c) => c.id)).size !== clips(result).length)
    throw new Error("Clip IDs must be unique.");
  return result;
}
export function validate(
  s: SetContent,
  unavailable: Record<string, string> = {},
): Issue[] {
  const issues: Issue[] = [];
  const report = (
    severity: Issue["severity"],
    code: string,
    message: string,
    clipId?: string,
  ) => issues.push({ severity, code, message, clipId });
  if (!s.name.trim()) report("error", "name", "Enter a set name.");
  for (const [kind, lane] of [
    ["Audio", s.audioClips],
    ["Visual", s.visualClips],
  ] as const) {
    if (!lane.length)
      report("error", "empty", `Add at least one ${kind.toLowerCase()} clip.`);
    let covered = 0;
    const sorted = ordered(lane);
    sorted.forEach((c, i) => {
      if (
        c.startMs < 0 ||
        c.durationMs <= 0 ||
        c.fadeInMs < 0 ||
        c.fadeOutMs < 0 ||
        c.fadeInMs > c.durationMs ||
        c.fadeOutMs > c.durationMs
      )
        report(
          "error",
          "timing",
          `${c.media.title}: invalid timing or fade.`,
          c.id,
        );
      if (
        c.sourceOffsetMs < 0 ||
        (kind === "Visual" && c.sourceOffsetMs !== 0) ||
        (kind === "Audio" &&
          c.media.durationMs !== undefined &&
          c.sourceOffsetMs + c.durationMs > c.media.durationMs)
      )
        report(
          "error",
          "offset",
          `${c.media.title}: source offset/duration is outside the source.`,
          c.id,
        );
      if (unavailable[c.media.id])
        report(
          "error",
          "unavailable",
          `${c.media.title}: ${unavailable[c.media.id]}`,
          c.id,
        );
      const prev = sorted[i - 1];
      if (prev && end(prev) > c.startMs) {
        const overlap = end(prev) - c.startMs;
        if (
          end(c) < end(prev) ||
          overlap > Math.min(c.durationMs, prev.durationMs) ||
          (i > 1 && end(sorted[i - 2]!) > c.startMs) ||
          c.fadeInMs !== overlap ||
          prev.fadeOutMs !== overlap
        )
          report(
            "error",
            "overlap",
            `${c.media.title}: overlap must be an adjacent transition with matching fades.`,
            c.id,
          );
      }
      if (c.startMs > covered)
        report(
          "warning",
          "gap",
          `${kind} gap from ${timecode(covered)} to ${timecode(c.startMs)}.`,
        );
      covered = Math.max(covered, end(c));
    });
    if (lane.length && covered < duration(s))
      report(
        "warning",
        "gap",
        `${kind} gap from ${timecode(covered)} to ${timecode(duration(s))}.`,
      );
  }
  return issues;
}
export function timecode(ms: number) {
  const n = Math.max(0, Math.round(ms));
  return `${String(Math.floor(n / 3600000)).padStart(2, "0")}:${String(Math.floor(n / 60000) % 60).padStart(2, "0")}:${String(Math.floor(n / 1000) % 60).padStart(2, "0")}.${String(n % 1000).padStart(3, "0")}`;
}
/** Recompute overlap fades after direct manipulation; unrelated standalone fades survive. */
export function transitions(lane: Clip[], previous: Clip[] = []): Clip[] {
  const old = ordered(previous);
  const resetIn = new Set<string>(),
    resetOut = new Set<string>();
  for (let i = 1; i < old.length; i++)
    if (end(old[i - 1]!) > old[i]!.startMs) {
      resetOut.add(old[i - 1]!.id);
      resetIn.add(old[i]!.id);
    }
  const next = ordered(lane).map((c) => ({
    ...c,
    fadeInMs: resetIn.has(c.id) ? 0 : Math.min(c.fadeInMs, c.durationMs),
    fadeOutMs: resetOut.has(c.id) ? 0 : Math.min(c.fadeOutMs, c.durationMs),
  }));
  for (let i = 1; i < next.length; i++) {
    const a = next[i - 1]!,
      b = next[i]!;
    const overlap = end(a) - b.startMs;
    if (overlap > 0) {
      a.fadeOutMs = overlap;
      b.fadeInMs = overlap;
    }
  }
  return next;
}
