/** Database UUIDs remain the internal identity; slugs address public pages. */
export function visualisationPath(vis: { id: string; slug?: string }): string {
  return `/vis/${encodeURIComponent(vis.slug || vis.id)}`;
}

export function isVisualisationId(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
