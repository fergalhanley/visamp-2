import "server-only";
import type { MetadataRoute } from "next";
import { createPublicClient } from "@/lib/supabase/public";
import { createAdminClient } from "@/lib/supabase/admin";
import { SITE_URL, staticSearchPaths } from "@/lib/seo";

const PAGE_SIZE = 1000;

export async function pagedRows<T>(fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await fetchPage(from, from + PAGE_SIZE - 1);
    if (error || !data) throw new Error("Could not load public sitemap entries");
    rows.push(...data);
    if (rows.length > 49000) throw new Error("Split the sitemap before exceeding 50,000 URLs");
    if (data.length < PAGE_SIZE) return rows;
  }
}

export async function publicSitemap(): Promise<MetadataRoute.Sitemap> {
  const db = createPublicClient();
  const [works, artists] = await Promise.all([
    pagedRows((from, to) => db.from("visualisations")
      .select("id,updated_at,profiles!visualisations_owner_id_fkey(username)")
      .eq("visibility", "public").order("id").range(from, to)),
    // Artist profiles are already public, including those without live tracks.
    // These tables deny anon access, so select only the public slug here.
    pagedRows((from, to) => createAdminClient().from("music_artists")
      .select("slug").order("id").range(from, to)),
  ]);
  const creators = new Set(works.map(row => row.profiles?.username).filter((name): name is string => Boolean(name)));
  const entries: MetadataRoute.Sitemap = [
    ...staticSearchPaths.map(path => ({ url: new URL(path, SITE_URL).href })),
    ...works.map(row => ({ url: `${SITE_URL}/vis/${row.id}`, lastModified: row.updated_at })),
    ...[...creators].map(name => ({ url: `${SITE_URL}/creators/${encodeURIComponent(name)}` })),
    ...artists.map(row => ({ url: `${SITE_URL}/artists/${encodeURIComponent(row.slug)}` })),
  ];
  if (entries.length > 50000) throw new Error("Split the sitemap before exceeding 50,000 URLs");
  return entries;
}
