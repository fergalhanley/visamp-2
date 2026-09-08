# Visamp MVP product specification

Status: agreed direction plus explicitly open decisions; section-by-section discovery is ongoing.
Code baseline: f224eeebd0fa003cda6c5fbd65e01eb3ac3f9a7e, reviewed 8 September 2026.
The current application is a PoC. Code presence is not evidence of beta readiness.

This replaces the former PoC product specification. Linear remains the authority for
assigned work and delivery status. [Linear backlog mapping](mvp-backlog.md) links the live projects and issues.
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
- Free platform initially, with one-off credit packs purchased through Stripe in MVP.
- Subscriptions (including recurring credit plans), advertising and artist revenue sharing are later roadmap work.
- Initially onboard artists under non-exclusive permission to host their music, offering
  promotion and visual creation benefits. Exact agreement and grants remain to be defined.
- Pursue Australian grants, company formation and later investment, using a launched product
  and real usage as evidence. Funding availability and eligibility are unconfirmed.

## Devices

- Initial launch: desktop browser with creation and playback.
- Initial launch: mobile/tablet playback, discovery, profiles, following, likes and comments.
  Visual creation/editing remains desktop-only; hide Create/Edit and other visual-authoring
  entry points on mobile/tablet.
- Mobile/tablet player: full-screen visual experience with popover controls revealed by tapping
  the player. Adapt the desktop controls for touch and smaller screens.
- Support portrait and landscape, with landscape providing a more immersive viewing layout.
  Detailed popover layout, dismissal timing and device/browser acceptance matrix remain to be defined.
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
| Direct to player, returning listener | Restore previous session visual/context | Restore previous audio state |
| Direct to player, no saved session | Topmost visualisation | Featured music artist |
| Visual discovery tile | Selected visualisation | Featured music artist |
| Music discovery tile | Visual assigned to the track, otherwise most popular visual | Selected track |

Initial featured music artist: Gereon. Fergal reports permission to use Gereon's music
on the site; onboard the artist and record the actual permission scope.
Do not infer permission for exports, social redistribution or livestreams from site permission.

Admin must be able to configure featured artists as more join.
A track's preferred visual may be assigned by an admin or the music artist. It applies
only when visuals are not already driven by a user's explicit visual selection or visual playlist.
Changing music must not override those deliberate visual choices.
Restore previous state for returning listeners by default. An explicit visual route overrides
the restored visual. Detailed precedence for track/list/set routes and unrelated restored state
remains to be defined.

Open: meaning of topmost; first track and running order; multiple featured artists;
popularity metric; unavailable-content fallbacks and cross-device scope.
Restore selected visual, available audio and player settings; exact track position need not persist.
Manual visual choice remains authoritative until the user explicitly returns to follow-music mode.
Next/Previous visual navigation preserves the selection mode: automatic stays automatic and manual
stays manual. Explicitly selecting a visual activates manual override.

### Player content routes

| Route | Content/context |
| --- | --- |
| /vis/<vis id> | Explicit visualisation |
| /track/<source>/<id> | Track identified by source and ID |
| /track_list/<track_list id> | Music track list |
| /playlist/<playlist id> | Visual playlist |
| /set/<set id> | Visual/track pairings and timing |

These are requested route shapes; only /vis exists in the reviewed player.
Extend the shared player/session model to understand content context, rather than rewriting
every visit as a visual-only URL. Direct load, reload and browser back/forward need acceptance
coverage. Model sets now; release set authoring/playback soon after MVP as an important step
into the VJ mode screen. Do not include the set UI/player in the initial beta deadline.
Favourites are personal and not shareable. Playlists and sets should be shareable.
Open: source identifiers, privacy/default visibility for shareable collections and set timing design.

### Audio source boundaries

Automatic/default music, site-shared music lists and audio used in shared sets must use
Visamp-hosted tracks. Preferred audio tracks must also be Visamp-hosted.
SoundCloud and local files remain personal inputs; do not mix them into site-shared collections.
This supersedes the PoC SoundCloud default: its integration stays available for personal listening.
MVP video export accepts local files and eligible Visamp-hosted tracks only.
Microphone input and SoundCloud are excluded from MVP export.


An artist uploading music should initially see one of their own visuals if they have any,
otherwise a community visual. Selection details remain open.
Track assignment is distinct from this suggested starting visual.

## Player interface

- Fixed-width side panels approximately twice their current desktop width; no drag resizing.
  Constrain layout on smaller viewports during responsive design.
- Add a top menu bar containing navigation, login, account/profile access,
  Create Vis and Fork Vis.
- Reveal the bar by hovering at the top of the player, with a fade-in.
  It must not overlap the side panels. Exact hide timing and focus behaviour remain open.
- Add or ensure visible Next/Previous visual buttons on player controls.
- Visual shortcuts: Space = next visual; Backspace = previous visual.
  Preserve selection mode when using these controls; explicit visual selection is a distinct action.
- Implementation acceptance: shortcuts must not interfere with text inputs, editable content or
  focused buttons/dialogs; prevent page scrolling/history effects only when handling a player shortcut.
- On mobile/tablet, tapping the player reveals popover controls over the full-screen visual.
  Adapt navigation and transport controls for touch; hide visual creation/editing actions.
  Support portrait and landscape. Detailed placement and dismissal behaviour remain open.
- Fergal reports playback reliability is now good across the board, with local-file restoration
  on reload as a known issue. This is user-reported validation, not automated test evidence.
- Retain local files across reloads where supported. Investigate existing IndexedDB file handles,
  permission reconnection, file ordering and source/session restoration.
- Current code restores local handles with granted access but reduces reauthorisation candidates
  to names; no requestPermission call is made. It also starts SoundCloud during restore and saves
  only the latest picker batch of handles. These are implementation gaps to investigate.
- Browser feasibility: persistent file handles are available in supporting browsers; a
  user-triggered reconnect can be required. Optional browser-local copies (IndexedDB/OPFS)
  are an alternative with quota/eviction/storage-management tradeoffs, not yet an approved design.
  No local-audio upload to Visamp is implied.
  References: [Chrome file access](https://developer.chrome.com/docs/capabilities/web-apis/file-system-access),
  [Chrome persistent permission](https://developer.chrome.com/blog/persistent-permissions-for-the-file-system-access-api),
  [browser storage limits](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria).

## Users, creators and artists

Confirmed: users can contribute visualisations, music or both. Music artists may exist
without a registered user account.

Proposed terminology, pending final confirmation: "creator" for visualisation attribution,
"artist" for music attribution. These describe context rather than mutually exclusive accounts.

Current schema: auth users/profiles own visuals; music_artists has optional claimed_by linking
an artist to a user. Preserve support for unclaimed artists. Profile presentation, artist
claiming and administrative permissions require definition. Existing /artists lists visual creators.
One public user profile shows Visualisations and Music tabs when both content types apply.

## Accounts and community

- Fergal reports Google/GitHub sign-in working. Create account and Forgot password links
  do not work. Email/password login is unverified and treated as blocked pending signup repair.
- Follow/unfollow and a Following filter in discovery are MVP requirements.
  New-publication notifications are later-release work.
- Setting a visual to Public makes it viewable immediately; no approval queue.
- Existing comments/replies suffice for beta. Discord is expected to be the primary community;
  expand comments if usage justifies it.
- Moderation tooling is explicitly outside beta scope; revisit in response to need.

## Music-artist onboarding and publication

- Fergal primarily recruits/ingests artists; artists must also be able to upload their music.
- Artist self-uploads accept the non-exclusive agreement online.
- For Fergal-managed uploads, his intended process is to email the agreement and record
  the confirmation reply. Store the agreement and evidence together; this records a product
  workflow, not a determination that any particular wording clears every required right.
- Automatically publish after successful processing and applicable permission checks.
  Keep published/unpublished status so content can be unpublished. This changes the PoC
  worker/admin-review flow, which currently leaves processed tracks in draft.
- Artist-managed fields/actions: title, artwork, description, preferred visual and withdrawal.
- Implement admin artist/licence onboarding to remove routine database setup.
- Upload/admin still needs end-to-end user validation.

## Visual language, editor, AI and assets

- Fergal will hand-pick suitable v1 visuals from another repository for porting.
  Repository location and chosen collection are pending; do not port the entire catalogue.
- Use those ports to identify required language capabilities, plus explicit exploration/gap analysis.
- Rename the DSL to a marketable name and propagate through code, site and docs.
  Viscript and VDSL are candidates, not a decision. Naming/compatibility checks remain open.
- MVP includes an asset library and user uploads: bitmaps, SVGs and 3D models.
  Assets are private by default and usable only by their uploader until made public.
  Public assets are available for other users to reuse, including in exported videos.
  Upload requires confirmation of upload rights and implies reuse permission within the applicable
  visibility scope. Exact permission/attribution wording, formats and quotas remain to be defined.
- Only an admin can remove a public asset from public availability, optionally replacing it.
  Removal makes it unavailable everywhere, including existing visualisations.
- Visualisations with a removed asset continue rendering without that asset and show a warning.
  If unresolved after 24 hours, automatically make the affected visualisation private.
  Owner notifications are later-release work. Define timer handling, replacement compatibility
  and recovery/republishing behaviour before implementation.
- GLSL/shader authoring context is a later-release feature.
- Editor is generally satisfactory. Improve error reporting beyond the first error where feasible.
- Silent compile/interpreter/render-update failures need reproduction, investigation and fixing.
  Owner: Fergal Hanley, working with an agent; he will investigate the reproduction.
- Qwen is not working adequately and is excluded from MVP.
- Provider choice is automatic: ChatGPT first, Claude if ChatGPT is unavailable.
  Admin selects the provider preference/fallback configuration; remove end-user provider selection.
  Define unavailable/error categories and retry limits before implementation.
  Apply the fixed-per-request AI charging rules below across retries and provider fallback.
  Invalid generated code is not automatically synonymous with provider unavailability.
- Existing undo across AI edits is sufficient for MVP. Client-side history panel is a
  post-MVP refinement; no server-side history requirement has been agreed.
- AI quality/cost evaluation and a bounded language launch feature set remain required.

## Video export

- MVP export is track-based: one visualisation for the full track duration.
  Advanced sequencing, multiple visuals per track and other export features come later.
- Eligible audio sources: local files and Visamp-hosted music only.
  Exclude microphone input and SoundCloud from MVP export.
- Output: 1080p at 30 fps, with landscape 16:9 and portrait 9:16 options.
- Investigate client-side rendering first. Use server-side rendering if the required export
  quality/reliability cannot be delivered client-side. Feasibility is not yet established.
- Include a discreet Visamp watermark in the free tier/MVP.
  Paid watermark-free export is a later feature.
- Validate audio/video sync, full-duration completion, portrait composition and asset loading.
  Codec/container, browser support, rendering limits and failure handling remain to be defined.
- Resolve visual reuse/fork attribution and hosted-music export permission in the relevant
  agreements; existing site-playback permission alone does not establish export permission.
  Public assets carry the reuse permission described above.
- Server-rendered video exports consume credits. Client-rendered exports with the
  Visamp watermark are free. Server-render pricing is based on video duration and the exact
  credit cost is shown before starting. Failed exports incur no charge. Rates and rounding remain open.

## Credits, billing and measurement

- AI creation/editing and server-rendered video exports consume credits.
- Client-rendered exports with the Visamp watermark are free.
- Listening, manual visual editing and community features are free.
- Charge a fixed credit amount per successful user AI request. Automatic retries and provider
  fallback are included in that one charge; failed responses incur no charge.
- Disliking a successful result or undoing the AI edit does not reverse its credit charge.
  Reconsider this policy if user complaints warrant it.
- Set the fixed amount using average provider costs across all users, including retries and
  failed requests. The amount and success criteria still need definition.
- Server-rendered exports are priced by video duration, with the exact credit cost shown
  before starting. Failed exports incur no charge. Rate and duration rounding remain open.
- Show credit costs on AI/export actions and provide an account billing page with balance,
  purchases, usage and upcoming expiries.
- In the editor, show the credit balance next to the AI prompt submission button.
  At a balance of zero or below, disable submission and offer a top-up button.
  Enforce sufficient credit for the full request cost on the server as well, including a
  positive balance below the required cost and concurrent submissions.
- Initial signup allowance target: enough credits for 20 successful AI requests at the
  applicable fixed request rate, giving new users room to learn the system.
- Make the signup credit amount admin-configurable so it can be calibrated over time and
  increased for new-user promotions. Final credit units depend on the AI pricing calculation.
- Record the amount/configuration used when granting credits; subsequent configuration changes
  apply to new grants without rewriting existing balances. Grant signup credits once per user:
  after successful Google/GitHub signup, or after email verification for email signup.
- MVP signup promotions are controlled manually by changing the admin signup allowance
  and restoring it when the promotion ends. Scheduled campaigns are outside MVP scope.
  The active allowance applies to new eligible signup grants.
- Allow discretionary free credits for prolific creators.
- Signup credits do not expire. Discretionary free grants may have an optional expiry date
  to encourage use; no universal expiry period is agreed.
- Build credit accounting to distinguish purchased, signup and discretionary allocations,
  with remaining amounts and optional per-grant expiry. Expiring one grant must not expire
  unrelated credits. Spend earliest-expiring credits first, then non-expiring free credits,
  then purchased credits. Expiry handling for in-flight requests remains open.
- MVP billing uses Stripe for one-off credit pack purchases. Subscriptions and recurring
  credit plans are deferred until after MVP.
- Purchased credits do not expire; they remain available until used.
- Manage one USD price per pack for MVP. Offer automatic local-currency pricing only through
  Stripe support with low implementation effort; do not maintain separate currency price lists.
  Otherwise defer localisation until after MVP and retain USD pricing.
- Stripe Adaptive Pricing supports automatic conversion in Checkout, but requires the price
  currency (USD here) to be a settlement currency on the Stripe account. Verify account eligibility
  during billing setup. Customers choosing conversion pay a 2–4% fee included in Stripe's rate.
  Use USD on Visamp pack listings and Stripe's local-currency presentation at checkout; no custom
  currency-conversion engine is required for MVP.
  Reference checked 8 September 2026:
  [Stripe Adaptive Pricing](https://docs.stripe.com/payments/currencies/localize-prices/adaptive-pricing?payment-ui=stripe-hosted).
- Pack sizes, prices, signup credit-unit calculation, discretionary grant expiry settings,
  purchase refunds, taxes and detailed billing layout remain open.
- Existing AI ledger is a foundation, not a completed billing system.
- Mixpanel is the selected provider, built in from launch.
- Measure repeat listening and active creation as equally important beta outcomes.
- Initial dashboard: active listeners, listening time, returning users, successful AI requests,
  published visualisations, music uploads and credit purchases.
- Include Fergal's activity in production metrics: he is a real user.
- Local development and test/agent sessions report to the staging Mixpanel project;
  real usage on the production deployment reports to production Mixpanel. No separate
  production account-filtering feature is required for beta.
- Keep these two analytics projects separate even while using a single Supabase environment.
  A separate deployed staging application/backend is deferred until after MVP.
- Define events, identity, consent, environment routing and precise metric definitions.
- Tests and development must never default to production tracking.

## Beta deployment and support

- Current state reported by Fergal: one Supabase environment, application running locally,
  and no Vercel deployment yet.
- MVP: prepare the existing environment for production and deploy to Vercel.
  Merging to main automatically deploys production once the deployment integration is configured.
  Retain the existing authorised PR-merge process; no separate manual deployment action is required.
- Post-MVP: adopt Gitflow with develop automatically deploying to a separate staging environment
  and main continuing to deploy production. Define release/hotfix details when introducing that flow.
- Update validation plans to use local execution against the existing backend before deployment,
  followed by focused checks of the deployed app. A full staging stack is not an MVP prerequisite.
  Keep local/test analytics pointed to staging Mixpanel.
- Stripe payment testing uses its test mode/sandbox; this does not require a separate staging
  application stack. Keep test purchases distinct from real credit purchases.
- No error reporting, uptime monitoring or alerts are currently in place.
  Define a minimal monitoring setup as launch operations work; send error/outage alerts to Slack.
  Monitoring provider(s) and the specific Slack channel remain to be selected.
- Discord is the community and beta bug-reporting/user-support channel. Fergal has an existing
  server; use the perpetual invite he supplied: https://discord.gg/exV68HvWV8.
  Make the invite available through Visamp only to signed-in users. Signed-out site UI must not
  expose the invite; it can direct users to sign in. This controls invite presentation in Visamp,
  not whether someone can forward a Discord invite externally.
  Review existing server channels before defining any additional setup.

## Company, funding and growth

Fergal will recruit a couple of friends first, post to relevant Reddit communities, and
encourage signups through social content and a regular livestream starting around beta.
He will publish as a visual artist using Visamp. Social accounts will use Visamp branding,
with Fergal as the recognisable host and visual creator.
Use a consistent logo and handle across platforms where available. Keep individual creator
and music-artist attribution on featured work, including Fergal's own visuals, so the official
channels can also feature community creators and artists.
Give the livestream a consistent series identity; "Visamp Live with Fergal" is a suggested title,
not a final naming decision. Lead clips with a striking visual or interesting creation moment,
then show how it was made. Plan full recordings, condensed creation walkthroughs and short
visual highlights as complementary outputs.

Launch priorities:
- Discord for community and beta support.
- Short-form video on YouTube Shorts, TikTok, Instagram and X.
- Livestreams on Twitch and YouTube.
Bluesky remains a candidate for later expansion, outside the selected initial channel priorities.

Initial livestream slot: Saturdays 10:00–11:00 am, Australia/Adelaide, targeting Friday evening
on the US East Coast and late afternoon on the West Coast. Fergal may add more days later.
Format: showcase existing visuals, then build a new visual live while demonstrating Visamp's
creation features. Record the session and repurpose it into content for the other launch platforms.
First stream date, detailed running order and production/simulcast setup remain open.
Account for seasonal daylight-saving differences when communicating US times.

Company setup has not started and needs to begin. Track it as a distinct business workstream,
alongside Australian grant research and preparation; do not assume registration or grant funding
has been completed. Fergal owns founder decisions.

Slack is the agent/company progress and operational-alert feed; Discord is the community.

admin@visamp.io is ready. Social accounts and their actual URLs still need setup.
Provision accounts and send messages only under the relevant user authorisation.
Replace placeholder policy/licensing pages with suitable final content.

## Evidence and remaining review

Code review found landing/gallery, player/audio sources, accounts/social features, editor/AI,
artist upload processing and admin track management. Credit accounting exists.
No Stripe purchasing, Mixpanel instrumentation or rendered-video export was found.
Fergal confirms the app runs locally with one Supabase environment and has not been deployed
on Vercel. Production deployment and its end-to-end functionality remain unverified.

Continue discovery in order: player; accounts/community; creator/artist identity and onboarding;
DSL/editor/AI; exports; credits/Stripe; mobile; analytics; operations/growth/funding.
Do not interpret an open decision or historical PoC story as an approved implementation requirement.
