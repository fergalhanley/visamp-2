import { TopBar } from "@/components/chrome/top-bar";
import { MarketplaceStudio } from "@/components/studio/marketplace-studio";

export const metadata = {
  robots: { index: false, follow: true },
  title: "Studio",
  description: "Pair your music with creator visuals in Visamp Studio.",
};

export default function StudioPage() {
  return (
    <div className="site-page">
      <TopBar />
      <main className="site-content max-w-[1500px]">
        <p className="site-eyebrow">VISAMP STUDIO</p>
        <h1>Find the visual for your track.</h1>
        <p className="max-w-3xl">
          Play your music through creator-made visuals, customise the controls
          they expose, then choose the one you want to use for your release.
        </p>
        <div className="mt-8">
          <MarketplaceStudio />
        </div>
      </main>
    </div>
  );
}
