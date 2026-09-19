# Public search and sharing

Tracking: VIS-136. Canonical origin: `https://www.visamp.io`, matching the live
apex-to-www redirect. Public pages declare their own canonical URL; the root
layout deliberately does not declare a homepage canonical for every route.

## Indexing policy

- Index home, player, artist/creator directories, public visualisations, public
  artist profiles and creators with public work. About and the epilepsy warning
  are also included.
- Account/billing, asset management, uploads, artist management, disputes, auth,
  editor and admin pages are noindex. This is search guidance, not access control.
- VIS-34 still owns policy/contact publication. Unfinished site pages (including
  news) remain available to visitors but noindex and absent from the sitemap.
  Add their descriptions to `publicSitePages` when approved content is published.
- Preview deployments emit noindex from the root and disallow crawling in robots.
  Vercel deployment protection remains independent of these hints.

`robots.txt` advertises `/sitemap.xml` and excludes API crawling. It allows utility
page crawling so engines can see their noindex metadata. The sitemap queries
anonymous, explicitly public visualisations and derives creator URLs from that
work. Artist profiles are public by the existing artist contract; their restricted
table is read server-side for slugs only. No session, email, private visualisation
or upload record contributes a URL. Queries page past the database's 1,000-row
response limit. Database errors fail the request rather than returning a successful
but incomplete sitemap. Work modification dates are real timestamps; other pages
omit dates rather than inventing a fresh last-modified on every crawl.

The current single sitemap supports up to 50,000 total URLs (with a 49,000-row
per-source guard). Split into sitemap shards and an index before reaching that
guard; failures are explicit rather than silently omitting public work.

## Creator rendering and share previews

Selected creator routes load through an anonymous server client and seed the
existing gallery with profile details and up to 200 public works, matching its
existing UI limit. Their text and work links are present before JavaScript runs.
The directory refresh retains a linked creator outside its top 200. All public
works remain discoverable through the sitemap even beyond that UI limit. Unknown
creators and profiles without public work return not-found; database errors remain
errors rather than pretending the profile is absent.

Creator and work selections use actual links with their existing in-page handlers;
modified clicks still open the target normally. Public visualisations retain their
own thumbnail previews; pages without artwork use `/share-image`, a 1200×630 PNG.
No VideoObject or video social type is claimed for an interactive visualisation.

## Release verification

After an owner-authorised release:

1. Fetch robots, sitemap and share image from the canonical origin. Check a public
   work/profile, a missing profile and a utility page with a crawler user agent.
2. Verify the domain in Google Search Console and submit
   `https://www.visamp.io/sitemap.xml`. This needs owner account access; it has not
   been performed by this change.
3. Use URL Inspection to check the selected canonical and rendered content.
4. Measure mobile Core Web Vitals and search impressions/clicks before prioritising
   performance or content work. This change makes no ranking or performance claim.

Content guides and approved contact/policy details remain separate editorial work.
Do not publish invented contact details or legal text to fill SEO placeholders.

Visualisation URLs now use stable title-derived slugs; legacy UUID URLs redirect.
See [naming and URL rules](visualisation-names.md) for allocation, publication and migration details.
