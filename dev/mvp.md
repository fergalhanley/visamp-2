# Visamp MVP product specification

Status: agreed direction plus explicitly open decisions; section-by-section discovery is ongoing.
Code baseline: f224eeebd0fa003cda6c5fbd65e01eb3ac3f9a7e, reviewed 8 September 2026.
The current application is a PoC. Code presence is not evidence of beta readiness.

This replaces the former PoC product specification. Linear remains the authority for
assigned work and delivery status. [Ticket drafts](mvp-backlog.md) await transfer to Linear.
[AI baseline](../agents/visamp-ai-codegen-spec.md) and
[hosted-audio baseline](../agents/visamp-hosted-audio-spec.md) describe existing implementation.

## Purpose and audience

Become a music listening, discovery and visualisation platform. Community visual creation
and casual/professional VJ use support the long-term listening proposition. Artists can
host music and use visuals for their releases. Competing in mainstream music listening
and possible acquisition are long-term ambitions, not beta acceptance criteria.

The founding audience is technically oriented electronic-music enthusiasts using desktop
browsers: listeners, visual creators and music artists, with overlapping roles.
Age estimates are recruitment hypotheses: teens 10%, twenties 35%, thirties 25%,
forties 20%, fifty-plus 10%. Deliberately encourage female participation.
This community should retain meaningful value as the platform expands.

## Beta and business constraints

- Soft launch targeted roughly two weeks from the September 2026 planning discussion.
- Fergal is available full-time for the first month, with approximately A$2,000 initial budget.
- Beta is open to anyone with the URL; no invitation gate.
- Clearly identify the service as beta and explain that features may change or be removed.
  Beta wording manages expectations; it does not replace published terms.
- Free platform initially, with paid credits through Stripe in initial scope.
- Advertising, broader subscriptions and artist revenue sharing are later roadmap work.
- Initially onboard artists under non-exclusive permission to host their music, offering
  promotion and visual creation benefits. Exact agreement and grants remain to be defined.
- Pursue Australian grants, company formation and later investment, using a launched product
  and real usage as evidence. Funding availability and eligibility are unconfirmed.

## Devices

- Initial launch: desktop browser with creation and playback.
- Initial launch: mobile/tablet viewer and player; layout still needs definition and implementation.
- Later: TV browser mode at visamp.io, followed by platform-specific smart TV apps.
- Existing touch controls do not constitute mobile acceptance testing.

## Landing and discovery — owner: Fergal Hanley

- Minimalist hero featuring the logo in an impressive animated visualisation.
  Interactivity is optional and Fergal will design the experience.
- Improve the top navigation.
- Remove the promotional section near the bottom.
- Replace the discovery presentation with carousels: Featured, Popular visualisations,
  Popular musicians, Latest Visualisations, Just Dropped Music.
- Keep initial selection/ranking algorithms simple; define exact metrics and ordering before build.
- Provide a footer for site links, copyright and relevant links.
  A basic footer exists in the PoC; this task improves/completes it.
- Fergal owns the landing experience. Supporting data/API work can become separate tasks.

## Player entry behaviour

| Entry | Visual | Audio |
| --- | --- | --- |
| Direct to player | Topmost visualisation | Featured music artist |
| Visual discovery tile | Selected visualisation | Featured music artist |
| Music discovery tile | Visual assigned to the track, otherwise most popular visual | Selected track |

Initial featured music artist: Gereon. Fergal reports permission to use Gereon's music
on the site; onboard the artist and record the actual permission scope.
Do not infer permission for exports, social redistribution or livestreams from site permission.

Admin must be able to configure featured artists as more join.
Open: meaning of topmost; first track and running order; multiple featured artists;
popularity metric; unavailable-content fallbacks; precedence of remembered sessions.

An artist uploading music should initially see one of their own visuals if they have any,
otherwise a community visual. Selection details remain open.
Track assignment is distinct from this suggested starting visual.

## Player interface

- Widen the side panels; exact width/resizing behaviour remains open.
- Add a top menu bar containing navigation, login, account/profile access,
  Create Vis and Fork Vis.
- Reveal the bar on mouse activity/hover and hide it consistently with player controls.
  Exact reveal region, timing and focus behaviour remain open.
- Define touch equivalents during mobile design; do not assume hover works on touch.
- Playback reliability and desired changes need Fergal's validation.

## Users, creators and artists

Confirmed: users can contribute visualisations, music or both. Music artists may exist
without a registered user account.

Proposed terminology, pending final confirmation: "creator" for visualisation attribution,
"artist" for music attribution. These describe context rather than mutually exclusive accounts.

Current schema: auth users/profiles own visuals; music_artists has optional claimed_by linking
an artist to a user. Preserve support for unclaimed artists. Profile presentation, artist
claiming and administrative permissions require definition. Existing /artists lists visual creators.

## Creation, community and artist operations

- DSL and editor exist; define a bounded version-one feature set and validation checklist.
- AI generation exists; assess quality, reliability and cost before pricing credits.
- Accounts/community are implemented but await Fergal's validation; record resulting changes.
- Artist uploads and admin dashboard are untested by Fergal.
- Implement admin artist/licence onboarding to remove routine direct database setup.
- Validate upload, processing, preview, publication and withdrawal end to end.
- Rendered video export is intended for artists' own releases/social distribution and needs a spec.
  User proposes restricting audio sources to local/microphone input. Final eligibility,
  confirmation of rights, formats, duration and local/hosted rendering remain open.
- Define visual reuse, fork attribution and export permissions. Public visibility alone does
  not resolve permission for external or commercial reuse.

## Credits, billing and measurement

- Use a credit system for AI usage and video generation costs.
- Grant signup credits and allow discretionary free credits for prolific creators.
- Stripe is initial scope. Pack sizes, prices, expiry, refunds, taxes, billing UI and
  whether recurring credit plans ship in beta remain open.
- Existing AI ledger is a foundation, not a completed billing system.
- Mixpanel is the selected provider, built in from launch.
- Separate staging and production targets so development/testing does not contaminate
  production analytics, particularly during the small-user beta.
- Define events, identity, consent, internal-user handling and environment routing.
- Tests and development must never default to production tracking.

## Company, funding and growth

Fergal will publish as a visual artist, starting in earnest at beta: livestreams on
Twitch/YouTube (possibly simultaneously elsewhere), a Discord fan/user/creator community,
and content on X, Instagram, Bluesky, YouTube and TikTok. Channel priority/cadence remains open.
Slack is the agent/company progress feed; Discord is the public community.

admin@visamp.io is ready. Social accounts and their actual URLs still need setup.
Provision accounts and send messages only under the relevant user authorisation.
Replace placeholder policy/licensing pages with suitable final content.

## Evidence and remaining review

Code review found landing/gallery, player/audio sources, accounts/social features, editor/AI,
artist upload processing and admin track management. Credit accounting exists.
No Stripe purchasing, Mixpanel instrumentation or rendered-video export was found.
Deployment configuration and real end-to-end functionality remain unverified.

Continue discovery in order: player; accounts/community; creator/artist identity and onboarding;
DSL/editor/AI; exports; credits/Stripe; mobile; analytics; operations/growth/funding.
Do not interpret an open decision or historical PoC story as an approved implementation requirement.
