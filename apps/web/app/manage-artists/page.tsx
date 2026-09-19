import { TopBar } from "@/components/chrome/top-bar";
import { SiteFooter } from "@/components/site/site-footer";
import { ArtistManager } from "@/components/audio/artist-manager";
export const metadata = {
  robots: { index: false, follow: true },
  title: "Manage Artists",
  description: "Manage your artists, music and artwork on VisAmp.",
};
export default function ManageArtistsPage() {
  return (
    <div className="site-page">
      <TopBar />
      <main className="site-content max-w-4xl">
        <p className="site-eyebrow">YOUR MUSIC</p>
        <h1>Manage Artists</h1>
        <p>
          Manage your artist profiles, track details and artwork. Saved profile
          changes are public immediately.
        </p>
        <ArtistManager />
      </main>
      <SiteFooter />
    </div>
  );
}
