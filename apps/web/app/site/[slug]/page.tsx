import { appVersion, engineVersion } from "@/lib/versions";
import { Licencing } from "@/components/site/licencing";
import { TermsAndConditions } from "@/components/site/terms-and-conditions";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import Link from "next/link";
import { TopBar } from "@/components/chrome/top-bar";
import { SiteFooter, SocialLinks } from "@/components/site/site-footer";
import { sitePages } from "@/lib/site";
import { publicMetadata, publicSitePages, noIndex } from "@/lib/seo";
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const page = sitePages.find((page) => page.slug === slug);
  if (!page) notFound();
  const description = publicSitePages[slug];
  return description
    ? publicMetadata(`/site/${slug}`, page.title, description)
    : { title: page.title, robots: noIndex };
}
export default async function SitePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const page = sitePages.find((page) => page.slug === slug);
  if (!page) notFound();
  // Calculate the copyright year per request, rather than freezing it at build time.
  if (slug === "about") await connection();
  return (
    <div className="site-page">
      <TopBar />
      <main className="site-content prose-page">
        <p className="site-eyebrow">VISAMP</p>
        <h1>{page.title}</h1>
        {slug === "terms-and-conditions" ? (
          <TermsAndConditions />
        ) : slug === "licencing" ? (
          <Licencing />
        ) : slug === "about" ? (
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
            <SocialLinks large />
            <dl
              aria-label="Software versions"
              className="mt-8 grid w-fit grid-cols-[auto_auto] gap-x-8 gap-y-2 rounded-lg border border-white/10 px-5 py-4 text-sm"
            >
              <dt className="text-muted-foreground">VisAmp</dt>
              <dd className="font-mono tabular-nums">{appVersion}</dd>
              <dt className="text-muted-foreground">Engine</dt>
              <dd className="font-mono tabular-nums">{engineVersion}</dd>
            </dl>
            <div className="mt-8 text-sm text-muted-foreground">
              <p>© {new Date().getFullYear()} VisArc</p>
              <p>
                Uploaded music tracks belong to their respective rights holders
                and are hosted on VisAmp with permission.
              </p>
            </div>
          </>
        ) : slug === "privacy-policy" || slug === "cookie-policy" ? (
          <>
            <h2>Optional usage analytics</h2>
            <p>With your permission, we use Mixpanel (US data residency) to measure visits, listening, creation, uploads and credit purchases. Analytics uses a browser identifier and, when signed in, your account ID. We do not send your code, prompts, audio, filenames or email address.</p>
            <p>Analytics is off until you allow it. Your preference is stored in your browser. Use Analytics preferences in the footer to change your choice. Declining does not affect using VisAmp. Withdrawing stops new analytics; it does not automatically erase events already received.</p>
            <p>Essential authentication and purchase records are separate from optional analytics. The remaining site policy is being prepared.</p>
          </>
        ) : slug === "contact" ? (
          <>
            <p>
              Questions about licensing, a track you have uploaded, or something
              that looks broken — this is where to find us.
            </p>
            <p>
              Email <a href="mailto:admin@visamp.io" className="underline underline-offset-4">admin@visamp.io</a> or
              connect with us on our social channels.
            </p>
            <SocialLinks large />
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
              Please check back for the published document.
            </p>
          </>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
