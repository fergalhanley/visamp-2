/** Structural edges take priority over the second grid, even when zoomed out. */
export function snapTimelineTime(
  time: number,
  boundaries: number[],
  pixelsPerSecond: number,
  disabled = false,
  offsets = [0],
) {
  const rounded = Math.round(time);
  if (disabled) return rounded;
  const threshold = 18_000 / pixelsPerSecond; // 18 screen pixels at every zoom.
  let distance = Infinity;
  let result = rounded;
  for (const edge of boundaries) {
    for (const offset of offsets) {
      const delta = edge - (rounded + offset);
      if (Math.abs(delta) <= threshold && Math.abs(delta) < distance) {
        distance = Math.abs(delta);
        result = edge - offset;
      }
    }
  }
  // The transport clock/playhead has sub-millisecond precision; clip data does not.
  if (distance !== Infinity) return Math.round(result);
  const second = Math.round(rounded / 1000) * 1000;
  return Math.abs(second - rounded) <= threshold ? second : rounded;
}

/** Keep the timestamp under the pointer fixed when changing the visible range. */
export function anchoredTimelineScroll(
  scrollLeft: number,
  pointerX: number,
  previousVisibleMs: number,
  nextVisibleMs: number,
) {
  return Math.max(
    0,
    ((scrollLeft + pointerX) * previousVisibleMs) / nextVisibleMs - pointerX,
  );
}
