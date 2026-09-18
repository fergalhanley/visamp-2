import { TopBar } from "@/components/chrome/top-bar";
import { SiteFooter } from "@/components/site/site-footer";
import { UploadForm } from "@/components/audio/upload-form";
export const metadata = { title: "Upload music" };
export default async function UploadPage({
  searchParams,
}: {
  searchParams: Promise<{ artist?: string }>;
}) {
  const { artist } = await searchParams;
  return (
    <div className="site-page">
      <TopBar />
      <main className="site-content max-w-3xl">
        <p className="site-eyebrow">FOR THE MUSIC MAKERS</p>
        <h1>Give your sound a new home.</h1>
        <p>
          Upload your MP3s and bring your music to a world of visuals. Each
          track becomes available as soon as its upload is verified.
        </p>
        <p>
          <a href="/my-artists" className="underline">
            Manage my artists, track details & artwork
          </a>
        </p>
        <UploadForm initialArtistId={artist} />
      </main>
      <SiteFooter />
    </div>
  );
}
