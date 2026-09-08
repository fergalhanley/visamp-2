import { Landing } from "@/components/site/landing";
import { getGalleryPage, type GalleryPage } from "@/lib/gallery";

export default async function Home() {
  let initial: GalleryPage = { items: [], next: null };
  let initialError: string | null = null;
  try {
    initial = await getGalleryPage();
  } catch {
    initialError = "The gallery could not be loaded. Please try again.";
  }
  return <Landing initial={initial} initialError={initialError} />;
}
