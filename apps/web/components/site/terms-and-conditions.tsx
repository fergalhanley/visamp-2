import Link from "next/link";
/** VIS-148: owner-confirmed policy choices and review notes are recorded in dev/terms-and-conditions.md. */
export function TermsAndConditions() {
  return (
    <article className="space-y-10 text-sm leading-7 text-muted-foreground [&_h2]:mb-3 [&_h2]:text-xl [&_h2]:font-medium [&_h2]:text-foreground [&_a]:underline [&_a]:underline-offset-4 [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-6">
      <p className="text-xs">Version 1.0 · Last updated <time dateTime="2026-09-20">20 September 2026</time></p>

      <section aria-labelledby="terms-service">
        <h2 id="terms-service">1. Using VisAmp</h2>
        <p>VisAmp is operated by VisArc, South Australia, Australia (“VisArc”, “we”, “us” or “our”). VisAmp lets you create, discover and play music visualisations, use visual assets, listen to music and interact with other creators. These terms cover the website, player, editor and related services. “You” means the person using the service or an organisation they are authorised to represent.</p>
        <p>You must be legally able to agree to these terms. If you need a parent’s or guardian’s permission under the law where you live, obtain it before creating an account, uploading content or making a purchase. You must have authority to act for any artist or organisation you represent.</p>
        <p>These terms apply when you agree to them in connection with your use of VisAmp. Our <Link href="/site/licencing">Licencing page</Link> explains the content permissions below. Questions about these terms can be sent to <a href="mailto:admin@visamp.io">admin@visamp.io</a>.</p>
      </section>

      <section aria-labelledby="terms-account">
        <h2 id="terms-account">2. Your account</h2>
        <p>Provide accurate account information, protect your sign-in credentials and tell us promptly if you believe your account has been compromised. Do not impersonate another person, claim an artist without permission, sell access to an account or use multiple accounts to evade restrictions or abuse free credits.</p>
        <p>You are responsible for the content you submit and activity you authorise. A username, artist profile or claim on VisAmp does not establish ownership of a name, trademark, recording or other intellectual property.</p>
      </section>

      <section aria-labelledby="terms-content">
        <h2 id="terms-content">3. Your content and permissions</h2>
        <p>You keep the rights you hold in your visualisations, code, images, models, audio, artwork, profile information and other submissions. Uploading content does not transfer ownership to VisAmp. You must own it or have permission covering the ways you ask us and other users to use it, including any samples, artwork, trademarks and personal information it contains.</p>
        <p>To provide the features you use, you grant VisAmp a non-exclusive, worldwide, royalty-free permission to store, reproduce, process, render and display your submissions, and to make technical adaptations such as thumbnails and format conversions. We may let our service providers perform these activities on our behalf. This permission is limited to operating and providing the service in accordance with your sharing choices and any separate upload agreement.</p>
        <p>When you publish a visualisation under these terms, you allow other users to play it and use VisAmp’s fork feature to copy, modify and publish their versions within VisAmp. This is a non-exclusive, royalty-free permission for those on-platform uses. Preserve the original creator’s attribution and fork lineage where provided. Public visibility is not an open-source licence or permission to redistribute the visualisation, its code or recordings of it outside VisAmp; that requires separate permission from the relevant rights holders, unless an existing licence or the law already permits it.</p>
        <p>Public visual assets have a separate permission: when you publish an image, vector or model under these terms, you allow users to incorporate it into VisAmp visualisations and videos exported from them, including sharing those videos outside VisAmp. This does not permit standalone asset redistribution or remove the need for permission for other visualisations or music in the video. The <Link href="/site/licencing">Licencing page</Link> describes the scope and what happens when an asset is made private.</p>
        <p>A fork does not transfer ownership of the original work. Making your original private or deleting it does not automatically delete independently saved forks. Contact us if a fork infringes your rights. These terms do not retrospectively grant rights in uploads whose rights holders have not agreed to the relevant permissions.</p>
        <p>Private visualisations are not made publicly available through the gallery. They still need to be processed and stored to provide the service. Do not upload secrets, passwords or content you are not entitled to share with the services needed to process it.</p>
        <p>Removing a visualisation or making it private restricts new access to that original through VisAmp, but cannot undo copies already lawfully obtained. Public assets have the separate visibility and reuse rules explained on the Licencing page. Limited copies may remain in backups, security records or records we are legally required to keep; they are not a continuing permission to publicly display removed content. Contact us about a rights complaint or removal request.</p>
      </section>

      <section aria-labelledby="terms-music">
        <h2 id="terms-music">4. Music uploads and artist claims</h2>
        <p>Music uploads are also governed by the version of the artist upload agreement you accept. You must own or control the relevant master recording and publishing rights, or have permission from the rights holders. Claiming to act on an artist’s behalf is a representation that you actually have that authority.</p>
        <p>The upload agreement grants a non-exclusive, worldwide licence to host, stream, transcode and synchronise the recordings with visuals. It allows a track to be withdrawn, ending that licence. These general terms do not extend that music licence or override its withdrawal provision.</p>
        <p>Making a track available on VisAmp, or selecting it as a visualisation’s preferred track, does not give listeners ownership of the music or permission to redistribute it, use it in advertisements, or use it outside the permissions provided by the service and the rights holders. Public performances, broadcasts, recordings and uses outside VisAmp may require additional permission.</p>
        <p>If an artist has been claimed without authority, or your work appears without permission, use the <Link href="/dispute">artist dispute page</Link> or email <a href="mailto:admin@visamp.io">admin@visamp.io</a>. Include the relevant links, the rights or authority you are asserting and a way to contact you. We may request evidence and temporarily restrict disputed material while reviewing it.</p>
      </section>

      <section aria-labelledby="terms-ai">
        <h2 id="terms-ai">5. AI-assisted creation</h2>
        <p>AI features process the prompts, source code and other material you submit to those features through the providers needed to generate a response. Only submit material you are authorised to provide for that purpose.</p>
        <p>Generated code and other output may contain errors, resemble other work or be unsuitable for your intended use. Review it before publishing or relying on it. VisAmp does not promise that output is unique, copyright-protected or free of third-party rights. These terms do not give you rights that VisAmp does not hold.</p>
      </section>

      <section aria-labelledby="terms-payments">
        <h2 id="terms-payments">6. Credits, payments and refunds</h2>
        <p>AI features may require credits. The credit cost, purchase price, currency and applicable taxes shown before you confirm a request or payment apply to that transaction. Credit purchases are processed through Stripe. A credit purchase is not a subscription or an automatic authorisation for future purchases.</p>
        <p>Ordinary generation requests use credits when they successfully complete; failed or cancelled ordinary requests do not consume them. An explicitly requested “Try to fix” attempt is charged even if it fails or is cancelled, as disclosed in the editor. Undoing a successful result does not automatically reverse its charge.</p>
        <p>Purchased credits and standard signup credits do not expire under the current credit scheme. Separate promotional grants may have an expiry disclosed with the grant. Credits provide access to VisAmp features; they are not cash, an investment or a promise that the same credit cost will apply to every future feature.</p>
        <p>For an incorrect charge, missing credits, a service problem or a refund request, contact <a href="mailto:admin@visamp.io">admin@visamp.io</a> with the purchase details. We will assess the circumstances and your legal rights. Nothing here excludes a refund, cancellation or other remedy required by law.</p>
        <p>If a purchase is refunded, the associated credits are removed proportionally. If they have already been used, the adjustment may reduce the available balance below zero and offset future credits. We will correct mistaken adjustments; this accounting process does not restrict your statutory refund rights.</p>
      </section>

      <section aria-labelledby="terms-conduct">
        <h2 id="terms-conduct">7. Acceptable use</h2>
        <p>Use VisAmp lawfully and respect other people’s rights. You must not:</p>
        <ul>
          <li>Upload unlawful content, infringe intellectual property or privacy rights, or misrepresent permission from an artist or rights holder.</li>
          <li>Harass, threaten, exploit or impersonate others, publish their private information without authority, or submit fraudulent claims or payment details.</li>
          <li>Introduce malware, steal credentials, bypass access controls, probe other users’ private content or interfere with the service.</li>
          <li>Evade account restrictions, payment requirements or rate limits, abuse promotional credits, or automate requests in ways that disrupt the service.</li>
          <li>Remove required attribution or claim another person’s work as your own.</li>
        </ul>
        <p>Report suspected vulnerabilities privately to <a href="mailto:admin@visamp.io">admin@visamp.io</a>. Do not access or disclose other users’ data to demonstrate an issue.</p>
      </section>

      <section aria-labelledby="terms-third-party">
        <h2 id="terms-third-party">8. Third-party services and local files</h2>
        <p>SoundCloud, social platforms, payment services and other linked services have their own terms and privacy practices. Their availability and content may change independently of VisAmp. A link is not an endorsement, and connecting a service does not override its rules.</p>
        <p>You must have the right to use music and files you load locally. Loading a local file for playback is separate from uploading a recording to the hosted music catalogue and does not grant other users rights in that file.</p>
      </section>

      <section aria-labelledby="terms-safety">
        <h2 id="terms-safety">9. Visual and audio safety</h2>
        <p>Visualisations may contain flashing lights, rapid colour changes and moving patterns that can trigger seizures or cause discomfort. Read the <Link href="/site/epilepsy-warning">epilepsy warning</Link> before using the player. Stop viewing if you feel unwell, avoid use in situations requiring attention, and keep audio at a safe volume.</p>
      </section>

      <section aria-labelledby="terms-privacy">
        <h2 id="terms-privacy">10. Privacy and analytics</h2>
        <p>Our <Link href="/site/privacy-policy">Privacy Policy</Link> and <Link href="/site/cookie-policy">Cookie Policy</Link> describe our information practices. Optional analytics requires your separate choice; accepting these terms is not analytics consent. You can change analytics preferences in <Link href="/settings">Settings</Link>.</p>
      </section>

      <section aria-labelledby="terms-moderation">
        <h2 id="terms-moderation">11. Moderation, restrictions and account closure</h2>
        <p>We may restrict access to content or an account where reasonably necessary to address a breach of these terms, a rights complaint, fraud, a security threat or a legal obligation. The action should be proportionate to the issue. Where practical and lawful, we will explain the reason and give you an opportunity to respond; urgent risks may require action first.</p>
        <p>You can ask us to review a restriction or request account closure by emailing <a href="mailto:admin@visamp.io">admin@visamp.io</a>. We may need to verify your identity. Closure does not remove legal record-keeping obligations or resolve outstanding rights complaints automatically. Contact us about unused purchased credits when requesting closure; your statutory rights continue to apply.</p>
      </section>

      <section aria-labelledby="terms-availability">
        <h2 id="terms-availability">12. Availability and your legal rights</h2>
        <p>VisAmp is an evolving service. Features, compatibility and third-party integrations may change, and outages or errors can occur. Keep your own copies of work you need to preserve. We do not promise uninterrupted availability or that every visualisation will work on every device.</p>
        <p>We will exercise reasonable care in providing the service. Nothing in these terms excludes, restricts or modifies a consumer guarantee or other right or remedy that cannot lawfully be excluded, including under the Australian Consumer Law where it applies. Any statement about availability, AI output or third-party services is subject to those rights.</p>
      </section>

      <section aria-labelledby="terms-changes">
        <h2 id="terms-changes">13. Changes and resolving concerns</h2>
        <p>We may update these terms to reflect changes to the service or legal requirements. We will identify the revised version and provide reasonable notice of material changes before they take effect, unless a legal or urgent security requirement makes earlier action necessary. Where consent is required, we will ask for it. Changes do not retrospectively alter completed purchases or expand content permissions already granted without the necessary agreement.</p>
        <p>If you do not agree to a change, you may stop using the affected service and contact us about your account and unused purchased credits. This does not limit any remedy available under law.</p>
        <p>These terms are governed by the laws of South Australia, Australia. The courts of South Australia have non-exclusive jurisdiction. This does not remove mandatory protections available where you live or require you to bring a claim in South Australia where applicable law gives you another forum.</p>
        <p>Please raise concerns at <a href="mailto:admin@visamp.io">admin@visamp.io</a> so we can try to resolve them. You remain free to seek advice, contact a regulator or pursue remedies available through the appropriate courts or tribunals. If a provision cannot lawfully be enforced, the remaining terms continue only to the extent they can operate lawfully.</p>
      </section>
    </article>
  );
}
