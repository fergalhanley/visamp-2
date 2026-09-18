import { publicSitemap } from "@/lib/seo-sitemap";

// Regenerate from public data on request; never bake a partial DB result into a build.
export const dynamic = "force-dynamic";
export default publicSitemap;
