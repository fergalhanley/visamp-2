export const titlePositions = [
  "Top Left",
  "Top Center",
  "Top Right",
  "Mid Left",
  "Mid Center",
  "Mid Right",
  "Bottom Left",
  "Bottom Center",
  "Bottom Right",
] as const;
export type TitleProperties = {
  enabled: boolean;
  position: (typeof titlePositions)[number];
  startMs: number;
  durationMs: number;
  size: "small" | "medium" | "large";
  showAttribution: boolean;
};
export const defaultTitleProperties: TitleProperties = {
  enabled: false,
  position: "Bottom Left",
  startMs: 0,
  durationMs: 5000,
  size: "medium",
  showAttribution: true,
};
export function parseTitleProperties(value: unknown): TitleProperties {
  if (!value || typeof value !== "object")
    throw new Error("Invalid title properties.");
  const p = value as TitleProperties;
  if (
    typeof p.enabled !== "boolean" ||
    typeof p.showAttribution !== "boolean" ||
    !titlePositions.includes(p.position) ||
    !["small", "medium", "large"].includes(p.size)
  )
    throw new Error("Invalid title properties.");
  if (
    !Number.isSafeInteger(p.startMs) ||
    p.startMs < 0 ||
    !Number.isSafeInteger(p.durationMs) ||
    p.durationMs <= 0 ||
    !Number.isSafeInteger(p.startMs + p.durationMs)
  )
    throw new Error(
      "Title start must be non-negative and duration positive, in whole milliseconds.",
    );
  return {
    enabled: p.enabled,
    position: p.position,
    startMs: p.startMs,
    durationMs: p.durationMs,
    size: p.size,
    showAttribution: p.showAttribution,
  };
}
