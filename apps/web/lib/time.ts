/**
 * "3 minutes ago" for a timestamp.
 *
 * Deliberately relative: on a comment or a saved draft, what matters is how
 * long ago rather than exactly when.
 */
export function relativeDate(iso: string | undefined): string {
  if (!iso) return "";

  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";

  const seconds = Math.max(0, (Date.now() - then) / 1000);
  const scales: [number, Intl.RelativeTimeFormatUnit][] = [
    [60, "second"],
    [60, "minute"],
    [24, "hour"],
    [7, "day"],
    [4.35, "week"],
    [12, "month"],
    [Number.POSITIVE_INFINITY, "year"],
  ];

  let value = seconds;
  for (const [step, unit] of scales) {
    if (value < step) {
      return new Intl.RelativeTimeFormat(undefined, { numeric: "auto" }).format(
        -Math.round(value),
        unit,
      );
    }
    value /= step;
  }
  return "";
}
