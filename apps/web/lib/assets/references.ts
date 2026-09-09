/**
 * VIS-51: the citation form that ties a visualisation to an asset,
 * `asset::bitmap(id: "<uuid>")`.
 *
 * The authoritative extractor is `public.visualisation_asset_references` in
 * `supabase/migrations/20260909020000_visual_assets.sql`, because clients write
 * `source` straight to PostgREST and no client-side pass can be trusted to keep
 * the index honest. This copy exists so the editor can show dependencies
 * without a round trip, and the tests hold the two patterns to the same cases.
 */

const REFERENCE =
  /asset::(?:bitmap|vector|model)\s*\(\s*id\s*:\s*"([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})"/gi;

/** Every distinct asset id cited by a piece of DSL source, lowercased. */
export function extractAssetReferences(source: string): string[] {
  const found = new Set<string>();
  for (const match of (source ?? "").matchAll(REFERENCE)) {
    found.add(match[1]!.toLowerCase());
  }
  return [...found];
}
