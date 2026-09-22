/** Duration visible across the timeline viewport at each zoom landmark. */
export function visibleTimelineMs(percent: number): number {
  const stops = [90, 30, 10, 3, 1];
  const value = Math.max(0, Math.min(100, percent)) / 25;
  const index = Math.min(3, Math.floor(value));
  return (
    stops[index]! *
    Math.pow(stops[index + 1]! / stops[index]!, value - index) *
    60000
  );
}
