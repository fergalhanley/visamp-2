import { notFound } from "next/navigation";
import Link from "next/link";
import { TopBar } from "@/components/chrome/top-bar";
import { SiteFooter } from "@/components/site/site-footer";
import { sitePages } from "@/lib/site";
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return {
    title:
      sitePages.find((page) => page.slug === slug)?.title ?? "Page not found",
  };
}
export default async function SitePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const page = sitePages.find((page) => page.slug === slug);
  if (!page) notFound();
  return (
    <div className="site-page">
      <TopBar />
      <main className="site-content prose-page">
        <p className="site-eyebrow">VISAMP</p>
        <h1>{page.title}</h1>
        {slug === "about" ? (
          <>
            <p>
              Music for your eyes. VisAmp is a place to discover, play and
              create music visualisations.
            </p>
            <p>
              Explore community-made visuals with hosted music, SoundCloud
              playlists, local audio files or your microphone.
            </p>
            <a className="site-button primary" href="/player">
              Open the player
            </a>
          </>
        ) : slug === "news" ? (
          <>
            <span className="site-badge">Nothing to report yet</span>
            <p>
              Releases, community highlights and what we are building next will
              be posted here.
            </p>
            <p>
              Until the first entry lands, the visualisations themselves are the
              news — new work appears on the home page as it is published.
            </p>
            <Link className="site-button primary" href="/">
              See what&apos;s new
            </Link>
          </>
        ) : slug === "contact" ? (
          <>
            <span className="site-badge">Channels coming soon</span>
            <p>
              Questions about licensing, a track you have uploaded, or something
              that looks broken — this is where to find us.
            </p>
            <p>
              The official email address and social accounts have not been set
              up yet. They will be listed here, and in the footer, as soon as
              they are.
            </p>
          </>
        ) : slug === "epilepsy-warning" ? (
          <>
            <p>
              VisAmp visualisations can contain flashing lights, rapidly
              changing colours and moving patterns. Some people may find these
              uncomfortable or triggering.
            </p>
            <p>
              If you are sensitive to flashing imagery, avoid the player. Stop
              viewing if you feel unwell.
            </p>
            <Link className="site-button secondary" href="/">
              Return to home
            </Link>
          </>
        ) : (
          <>
            <span className="site-badge">Content pending</span>
            <p>
              This page is reserved for the VisAmp {page.title.toLowerCase()}.
              The final policy has not been published yet.
            </p>
            <p>
              {slug === "licencing"
                ? "Artist uploads require an approved licence before their tracks can be published. The artist agreement and licensing details will be available here."
                : "Please check back for the published document."}
            </p>
          </>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
