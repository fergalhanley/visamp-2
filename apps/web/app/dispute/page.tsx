import type { Metadata } from "next";
import { TopBar } from "@/components/chrome/top-bar";
import { SiteFooter } from "@/components/site/site-footer";

export const metadata: Metadata = {
  title: "Dispute an artist claim",
  description: "How to contact VisAmp about an artist name claimed by someone else.",
};

export default function DisputePage() {
  return (
    <div className="site-page">
      <TopBar />
      <main className="site-content max-w-3xl">
        <p className="site-eyebrow">ARTIST CLAIMS</p>
        <h1>Dispute an artist claim.</h1>
        <p>
          If someone else has claimed your artist name on VisAmp, email{" "}
          <a href="mailto:dispute@visamp.io">dispute@visamp.io</a> with the details.
          We review artist-name disputes manually.
        </p>
        <h2>What to include</h2>
        <ul className="list-disc space-y-2 pl-6">
          <li>The artist name and a link to its VisAmp artist page.</li>
          <li>Your name, contact email and relationship to the artist.</li>
          <li>An explanation of the dispute and the outcome you are requesting.</li>
          <li>Supporting links, such as the artist’s official website, social profiles or music releases.</li>
        </ul>
        <h2>What happens next</h2>
        <p>
          We’ll review the information and contact you if we need more details.
          Sending a dispute does not automatically transfer an artist name or
          remove music. We’ll let you know the outcome by email.
        </p>
        <p>
          We’re keeping artist registration straightforward in these early stages
          and handling disputes by email. We may introduce further verification
          as the service grows.
        </p>
        <a className="site-button primary" href="mailto:dispute@visamp.io?subject=Artist%20name%20dispute">Email a dispute</a>
      </main>
      <SiteFooter />
    </div>
  );
}
