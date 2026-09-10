import { TopBar } from "@/components/chrome/top-bar";
import { SiteFooter } from "@/components/site/site-footer";
import { AssetLibrary } from "@/components/assets/asset-library";

export const metadata = { title: "Assets" };

export default function AssetsPage() {
  return (
    <div className="site-page">
      <TopBar />
      <main className="site-content max-w-3xl">
        <p className="site-eyebrow">FOR THE VISUAL MAKERS</p>
        <h1>Your images, vectors and models.</h1>
        <p>
          Upload the pieces your visuals are built from, then reference them from
          a script. Everything starts private — sharing is a choice you make per
          asset.
        </p>
        <AssetLibrary />
      </main>
      <SiteFooter />
    </div>
  );
}
