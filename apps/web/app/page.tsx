import { Landing } from "@/components/site/landing";
import { getGalleryPage, type GalleryPage } from "@/lib/gallery";
import { getLandingHeroSource } from "@/lib/landing-hero";
import { publicMetadata, SITE_DESCRIPTION } from "@/lib/seo";

export const metadata = {
  ...publicMetadata("/", "VisAmp — Music Visualizer & Creative Community", SITE_DESCRIPTION),
  title: { absolute: "VisAmp — Music Visualizer & Creative Community" },
};

export default async function Home() {
  let initial: GalleryPage = { items: [], next: null };
  let initialError: string | null = null;
  try {
    initial = await getGalleryPage();
  } catch {
    initialError = "The gallery could not be loaded. Please try again.";
  }
  // Never throws; a hero that cannot be loaded falls back to its own
  // background rather than taking the page down.
  const heroSource = await getLandingHeroSource();
  return (
    <Landing
      initial={initial}
      initialError={initialError}
      heroSource={heroSource}
    />
  );
}
