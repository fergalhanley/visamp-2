# MVP ticket drafts

These are repository drafts, not created Linear issues. Linear IDs and live statuses will
be added on transfer; thereafter Linear is authoritative. Owner names below record Fergal's
instructions, not verified external assignments. Product reference: [MVP specification](mvp.md).

## Linear transfer plan

Prepared for live setup; no Linear objects have been created or inspected yet because
the Linear plugin is not available in this session. D01–D35 below are local draft references,
not Linear issue IDs. Project names, priorities and dependencies are an initial delivery plan,
not additional product decisions or a claim that work is already in progress.

Use the existing Visamp team where available. Inspect existing projects/issues first and reuse
matching work rather than duplicating it. Create seven projects:

| Project | Outcome |
| --- | --- |
| Beta — Listening and community | Reliable desktop/mobile listening, discovery, accounts and hosted music |
| Beta — Creation and assets | Beta-ready visual language, editor, automatic AI routing and asset library |
| Beta — Credits and video export | Credit purchases/accounting and track-based video export |
| Beta — Launch operations | Production deployment, measurement and operational visibility |
| Launch — Community and content | Public beta recruitment, social accounts and founder livestream/content |
| Business — Company and funding | Company setup and funding research/application preparation |
| Roadmap — Post-MVP | Timed sets/VJ follow-up and other deferred capabilities |

Use existing workflow states where possible: Backlog, Todo, In Progress, In Review, Done.
Import unstarted work into Backlog; ready first-wave work can move to Todo after checking
the workspace. Preserve Fergal's explicit ownership in the drafts; leave implementation
ownership unassigned unless a real assignee is resolved. Do not create artificial agent users.
Link the product spec and this PR to each project; keep unresolved choices visible.
The approximate two-week beta ambition is not a validated delivery forecast. Do not invent
calendar deadlines or silently remove agreed beta features to fit it.

Suggested first wave: D23 auth repair; D29 editor failure investigation; D25 selected-port
inventory; D13 export feasibility; D08 identity presentation; D27 asset foundation; D31 AI
routing; D33 deployment configuration; D10 analytics definition; D15 company setup; D16 grant
research. Fergal can work on D01 landing alongside these. Feature and rollout dependencies
must not prevent independent configuration/design work.

Split broad drafts into bounded issues/sub-issues during live transfer:
- D09: pricing/cost calibration; allocation ledger and spending/expiry; signup/admin grants;
  Stripe one-off purchases/webhooks; editor balance/top-up; account billing UI; optional
  Adaptive Pricing eligibility/setup. Preserve the agreed policies in all affected issues.
- D25: Fergal selects v1 visuals; gap inventory; approved language feature implementation;
  selected visual ports/validation. Selection precedes feature-driven implementation.
- D27: asset storage/access/rights; library/upload UI; renderer loading and fork references.
  D28 owns missing-asset warnings and the 24-hour privacy rule.
- D05/D07: distinguish artist/licence admin onboarding, self-upload agreement/publication
  changes and end-to-end validation; code presence is not completion.
- D14: site/policy/beta information, authenticated Discord invite, and branded social setup.
- D21: MVP set data/route contract separately from post-MVP set authoring/playback/VJ work.
  D20 depends only on the model contract, never on the post-MVP UI release.
- D32: separate client history, shader authoring and notifications. Preserve the remaining
  roadmap from the product spec: TV browser/native apps, subscriptions, ads, artist revenue
  sharing, paid watermark removal and richer exports as unstarted roadmap items.

Important completion dependencies in addition to the local draft references below:
- D01 discovery data depends on D03/D08 and agreed simple ranking rules; hero design can start now.
- D09 final AI pricing uses D31 cost/retry evaluation; server-export pricing also uses D13.
- D12 depends on the relevant D09 credit work only if server rendering is selected; free
  client rendering is not blocked on paid-export metering.
- D18 requires export/livestream reuse permission for the chosen audio/visuals; site playback
  permission alone is not enough. D12 is useful for rendered social content, but recording
  a livestream need not wait for an in-product export feature.
- D33 initial deployment can occur before feature completion. Public beta readiness still
  requires the agreed core flows, hosted audio, billing, mobile, analytics and monitoring checks.
- D16 grant research can start alongside D15; only applications with relevant registration
  requirements depend on completed company setup.

After live creation: replace local draft references with real issue links, create supported
blocking relations, verify priorities/owners/project membership and write the resulting
Linear project/issue mapping back here. Do not mark drafts Done merely because they were imported.

## Landing experience and discovery

Planning reference: D01. Project: Beta — Listening and community. Phase: Beta. Proposed priority: High.

Owner: Fergal Hanley. State: assigned in planning; design in progress/ready to pick up.

Outcome: an inviting minimalist entry to the beta and straightforward content discovery.
Scope: animated logo hero (optional interaction), improved top menu, removal of lower promo,
five carousels, completed footer and visible beta messaging.
Carousels: Featured, Popular visualisations, Popular musicians, Latest Visualisations,
Just Dropped Music.
Acceptance: all five sections have working destinations and empty states; responsive layout;
footer site links/copyright; no remaining lower promo; beta identified.
Open: artwork/design, ranking definitions and any separate API/data implementation.
Do not assign the hero design to another agent.

## Player navigation and panel layout

Planning reference: D02. Project: Beta — Listening and community. Phase: Beta. Proposed priority: Normal.

Owner: unassigned. State: defining.
Outcome: easier browsing and account/navigation access without obscuring visuals at rest.
Scope: fixed panels approximately 2x current desktop width; top bar with navigation, login,
profile/account, Create Vis and Fork Vis. Top-edge hover triggers fade-in; bar does not overlap panels.
Acceptance: bar follows agreed reveal/hide behaviour; existing player controls continue to work;
logged-in/out states supported; desktop behaviour verified.
Open: navigation links, hide timing/focus, smaller-screen constraints and touch design.

## Featured artist configuration and entry routing

Planning reference: D03. Project: Beta — Listening and community. Phase: Beta. Proposed priority: High.
Depends on: D04, D05, D20.

Owner: unassigned. State: defining.
Outcome: player starts the intended visual/music combination from every discovery entry.
Scope: admin featured artist configuration; Gereon onboarding dependency; preferred track visual
assigned by admin or music artist. User-selected visual/visual playlist takes precedence over the
track preference. Restore previous session on return; explicit visual routes override restored visuals.
Acceptance: all entry cases in the MVP spec work; selected track/visual is preserved;
defaults are controlled by admin; unavailable content has an agreed fallback.
Open: topmost/popularity definitions, featured track ordering and multiple artists.
Automatic/default and preferred audio must be Visamp-hosted. Personal SoundCloud/local selections
are excluded from site-shared collections.

## Gereon founding artist onboarding

Planning reference: D04. Project: Beta — Listening and community. Phase: Beta. Proposed priority: High.
Depends on: D05.

Owner: unassigned. State: awaiting artist details and source material.
Outcome: Gereon's approved tracks are available as initial featured music.
Fergal reports permission for site use. Record exact artist identity, music sources and permission;
create the catalogue/licence record and validate published playback.
Acceptance: accurate credit, actual permission recorded, tracks playable and available for featuring.
Open: exact artist identity/links, tracks, documents and scope of permission.
Do not fabricate records or extend site permission to social/video/live distribution.

## Admin artist and licence onboarding

Planning reference: D05. Project: Beta — Listening and community. Phase: Beta. Proposed priority: High.
Depends on: D08.

Owner: unassigned. State: defining.
Outcome: routine artist/permission setup can be performed through admin UI.
Scope: create/edit artist, support an artist without a user, optionally link an existing user,
record permission details/documents/status, and make eligible artists available in upload flow.
Acceptance: authorised admin can onboard without SQL; non-admin access is rejected;
licence constraints still apply during upload/publication; no forced account for music artists.
Support online agreement acceptance for self-uploads and recorded emailed agreement/confirmation
for Fergal-managed uploads. Capture agreement version and acceptance evidence.
Open: claiming verification, agreement fields and management of multiple artist identities.

## Validate accounts and community

Planning reference: D06. Project: Beta — Listening and community. Phase: Beta. Proposed priority: High.
Depends on: D23, D24.

Owner: Fergal Hanley. State: needs user validation.
Cover sign-in/signup/reset, username/avatar/bio, ownership, public/private visuals,
likes, comments, favourites, forks and attribution.
Acceptance: outcomes and reproduction steps recorded; resulting bugs/change requests split
into scoped tickets. Presence of code does not count as a passing test.

## Validate artist uploads and admin

Planning reference: D07. Project: Beta — Listening and community. Phase: Beta. Proposed priority: High.
Depends on: D05.

Owner: unassigned. State: untested by Fergal.
Cover authorised upload, rejection/error recovery, processing worker, automatic publication,
metadata edit, playback, unpublish/withdrawal and admin permissions.
Change PoC draft/admin-review default: publish after processing and permission checks.
Artist controls include title, artwork, description, preferred visual and withdrawal.
Acceptance: end-to-end results recorded using local execution and the existing backend,
then focused checks after production deployment; failures become tickets.
Open: who executes validation and the production worker/storage configuration.
Do not require a separate staging stack for MVP.

## Define user/creator/music-artist presentation

Planning reference: D08. Project: Beta — Listening and community. Phase: Beta. Proposed priority: High.

Owner: unassigned. State: defining.
Outcome: one user can create visuals and music, with clear attribution and artist pages.
Use contextual Creator/Artist presentation, preserving artists without accounts.
One public user profile has Visualisations and Music tabs when both apply.
Acceptance: terminology, profile routes, claims/ownership and both-content presentation agreed;
migration plan builds on existing optional music_artists.claimed_by.

## Define and implement credits with Stripe

Planning reference: D09. Project: Beta — Credits and video export. Phase: Beta. Proposed priority: High.
Depends on: D23.

Owner: unassigned. State: defining.
Outcome: users can understand credit costs, obtain signup credits and purchase additional usage.
Build on the AI ledger; define packs/pricing, balance/history UI, failures/refunds,
creator grants and optional expiry for discretionary free credits.
Initial signup allowance target: credits covering 20 successful AI requests at the applicable
fixed request rate. Make the signup credit amount admin-configurable for calibration and
higher new-user promotional allowances.
Record each grant's amount and configuration/promotion reference where applicable; changes
affect new grants and do not recalculate existing balances. Issue the signup grant once per user,
including when signup callbacks or jobs are retried. Award after successful Google/GitHub signup,
or after email verification for email signup; unverified email signup does not receive the grant.
MVP promotion control is manual: admin changes the signup allowance and restores it when
finished. New signup grants use the active amount. No scheduled campaign system in MVP.
Open: final credit-unit conversion.
Purchased credits and signup credits do not expire; they remain available until used.
Discretionary grants may expire, with an optional expiry date per grant; no fixed duration agreed.
Support allocation-level source, remaining amount and expiry so grants can expire independently.
Acceptance: expiring a discretionary grant removes only its unused credits; purchased/signup
credits and non-expiring grants remain available. Show applicable expiry in the balance/history UI.
Spend earliest-expiring credits first, then non-expiring free credits, then purchased credits.
Open: expiry during in-flight requests.
MVP purchases are one-off credit packs through Stripe;
subscriptions and recurring credit plans are post-MVP.
Confirmed: AI creation/editing and server-rendered video exports consume credits.
Client-rendered exports with the Visamp watermark, listening, manual visual editing and
community features are free.
AI billing: fixed credits per successful user request, covering automatic retries/provider fallback.
Failed responses incur no charge. Calibrate the fixed amount against average provider costs
across all users, including retry and failure costs; do not pass individual retry costs to the user.
Show credit costs on AI/export actions. Provide an account billing page showing balance,
purchases, usage and upcoming expiries.
Editor: credit balance beside the AI prompt submission button; disable submission at zero or
below and offer a top-up button. Server must also enforce sufficient credit for the full request,
including positive-but-insufficient balances and concurrent requests.
Server exports: charge by video duration; show exact cost before starting; no charge for failed exports.
Open: fixed AI amount, technical success criteria, server-export rate and duration rounding.
Acceptance to finalise: Stripe test-mode purchase -> verified payment -> test credit allocation -> metered use,
including duplicate-payment-event handling, one AI charge for a successful request despite
retries/fallback, and no charge for a failed response.
Disliking a successful result or undoing the AI edit must not reverse the charge.
Reconsider this policy if user complaints warrant it.

Currency: one founder-managed USD price per pack. Include automatic local-currency checkout
only if Stripe supports it with low implementation effort for this account/integration; otherwise
ship USD-only and defer localisation. No manually maintained prices in other currencies.
Evaluate Stripe Adaptive Pricing using Checkout. USD must be a settlement currency on the account;
verify this in billing setup. Keep pack listings in USD and let Stripe calculate checkout conversion.
Acceptance: unchanged credit quantity across checkout currencies; verified payment grants the
purchased pack once; unsupported localisation falls back to USD.
See the Stripe reference and conversion-fee note in the MVP specification.

## Define and implement Mixpanel

Planning reference: D10. Project: Beta — Launch operations. Phase: Beta. Proposed priority: High.

Owner: unassigned. State: defining.
Outcome: trustworthy listening, creation, community and conversion measurement from beta.
Treat repeat listening and active creation as equally important beta outcomes.
Dashboard: active listeners, listening time, returning users, successful AI requests,
published visualisations, music uploads and credit purchases.
Include Fergal's real usage in production metrics. Local development and test/agent sessions
report to staging Mixpanel; real usage on the deployed app reports to production Mixpanel.
No production account-filtering feature is required for beta.
Acceptance: separate staging/production Mixpanel projects despite one Supabase environment;
local/test configuration cannot silently target production analytics; events/identity and dashboard
validated in staging Mixpanel; documented consent behaviour.
Do not require a separately deployed staging app/backend for MVP.
Open: event dictionary, identity handling, returning-user measures, listening-duration rules,
other precise metric definitions and configuration.

## Implement mobile/tablet viewer layout

Planning reference: D11. Project: Beta — Listening and community. Phase: Beta. Proposed priority: High.
Depends on: D02.

Owner: unassigned. State: MVP direction agreed; detailed layout pending.
Outcome: comfortable touch playback, discovery and community interaction at launch.
Keep discovery, profiles, following, likes and comments available on mobile/tablet.
Visual creation/editing is desktop-only: hide Create/Edit and other visual-authoring entry points.
Player: full-screen visuals with popover controls revealed when the user taps the player,
adapting the desktop controls for mobile. Support portrait and immersive landscape layouts.
Acceptance: touch navigation and transport controls work in both orientations; popovers remain
usable within the viewport; authoring actions are hidden; community actions remain available;
audio/visual behaviour verified on the agreed browser/device matrix.
Open: exact control/panel placement, dismissal timing, direct editor URL handling and test devices.
Do not assume the existing desktop hover controls already satisfy mobile requirements.

## Implement track-based video export

Planning reference: D12. Project: Beta — Credits and video export. Phase: Beta. Proposed priority: High.
Depends on: D13, D27.

Owner: unassigned. State: MVP scope agreed; technical design pending.
Outcome: export one visualisation for the full duration of one track.
Sources: local files and eligible Visamp-hosted tracks only; exclude microphone input and SoundCloud.
Output: 1080p, 30 fps, 16:9 landscape or 9:16 portrait, with a discreet Visamp watermark.
Acceptance: complete playable download, synchronised audio/visuals, correct duration/aspect ratio,
assets loaded and watermark present; clear failures without incorrect credit charges.
Open: codec/container, limits, server-render credit rates/rounding and permission/attribution.
Confirmed: server-rendered exports consume credits based on duration, with exact cost displayed
before starting and no charge for a failed export. Client-rendered watermarked exports are free.
Multiple visuals per track, advanced export editing and paid watermark removal are post-MVP.

## Evaluate client-side export and select rendering approach

Planning reference: D13. Project: Beta — Credits and video export. Phase: Beta. Proposed priority: High.

Owner: unassigned. State: investigation required before export implementation.
Prefer client-side rendering; fall back to server-side if required quality/reliability is not feasible.
Evaluate representative full tracks and complex visuals at the agreed output settings, including
audio/video sync, encoding/muxing, browser support, memory use and interrupted exports.
Acceptance: recorded feasibility evidence and implementation choice; if server rendering is needed,
define cost controls and feed estimated costs into credit pricing.
Client-rendered exports with the Visamp watermark are free; server-rendered exports consume credits.
Browser rendering feasibility remains to be established.

## Publish site information and establish social accounts

Planning reference: D14. Project: Launch — Community and content. Phase: Beta launch. Proposed priority: High.

Owner: unassigned. State: defining.
Replace policy/licensing placeholders; update About/beta messaging and copyright details.
Set up approved accounts using admin@visamp.io and wire real links.
Use Visamp branding for the social accounts; Fergal is the recognisable host and visual creator.
Use the same logo and handle across platforms where available; verify handle availability during setup.
Preserve individual creator/music-artist attribution, including Fergal's own work, when featuring content.
The official channels should support featuring other creators and artists as the community grows.
Launch priorities: existing Discord; YouTube Shorts, TikTok, Instagram and X for short-form content;
Twitch and YouTube for livestreams. Bluesky is outside the selected initial priorities.
Discord is the community and beta bug-reporting/user-support channel. Reuse Fergal's existing
server and supplied perpetual invite: https://discord.gg/exV68HvWV8.
Expose the invite only to signed-in users through Visamp; signed-out support entry points can
direct users to sign in. Verify signed-in/out rendering. Inspect existing channels before adding setup.
No new Discord server is required.
Acceptance: final destinations/content verified and no accidental placeholder links.
Open: handles, account ownership, publication approvals and content schedule.

## Begin company setup

Planning reference: D15. Project: Business — Company and funding. Phase: Start now. Proposed priority: High.

Owner: Fergal Hanley (founder decisions); preparation/execution unassigned. State: needs to start.
Outcome: prepare and carry out the agreed Australian company setup.
First prepare a current-source setup sequence, required founder inputs, costs and dependencies
for the intended Pty Ltd structure; record actual registration status as work progresses.
Acceptance: concrete setup tasks and required decisions identified, then completion evidence
recorded for executed steps. Do not claim the company already exists.

## Research grants and prepare funding applications

Planning reference: D16. Project: Business — Company and funding. Phase: Start now. Proposed priority: High.

Owner: Fergal Hanley (founder decisions); research/execution unassigned. State: defining.
Track Australian funding eligibility, deadlines, matching requirements, application evidence
and budget, accounting for company setup and the product/user traction timeline.
Acceptance: source-verified shortlist with requirements and next actions, realistic funding/budget
fit and application tasks for selected opportunities. No assumed grant award.

## Recruit founding beta users

Planning reference: D17. Project: Launch — Community and content. Phase: Beta launch. Proposed priority: High.
Depends on: D14.

Owner: Fergal Hanley for outreach; supporting preparation unassigned. State: plan agreed.
Start with a couple of friends, then relevant Reddit community posts and signup invitations
through social content and regular livestreams.
Acceptance: initial tester list/recruitment steps, candidate communities and reviewable post drafts,
plus signup destinations and measurement consistent with the Mixpanel plan.
Community selection and posting cadence remain open. No outreach has been sent by this planning task.

## Establish founder content and weekly livestream

Planning reference: D18. Project: Launch — Community and content. Phase: Beta launch. Proposed priority: High.
Depends on: D14, D25.

Owner: Fergal Hanley as visual artist/host; supporting execution unassigned. State: defining.
Start in earnest around the soft launch. Priorities: short-form videos on YouTube Shorts,
TikTok, Instagram and X; live on Twitch and YouTube; community interaction in Discord.
Initial live slot: Saturdays 10:00–11:00 am, Australia/Adelaide, aiming at Friday evening
US East Coast / late afternoon West Coast. Additional days may be added later.
Format: showcase existing visuals, then create a new visual live to demonstrate Visamp features.
Record each session and repurpose it into condensed creation walkthroughs and short visual highlights
for the other launch platforms. Lead clips with the visual or creation moment, then explain the process.
Use a consistent livestream series identity; "Visamp Live with Fergal" remains a suggested title.
Use Visamp-branded social accounts, with Fergal as host/visual creator.
Scope: detailed running order, production/simulcast workflow, recording, reusable clips and
signup calls to action. First stream date and additional broadcast days remain open.
Acceptance: reviewable first-stream plan, confirmed channel links, cleared source content,
working broadcast setup and a repeatable clipping/distribution workflow.
Check seasonal time-zone differences before publishing schedules. No broadcast or scheduled
automation has been created by this planning task.

## Restore local files and listening sessions after reload

Planning reference: D19. Project: Beta — Listening and community. Phase: Beta. Proposed priority: Normal.
Depends on: D20.

Owner: unassigned. State: defining/fix investigation.
Fergal reports current playback reliability is good; re-adding local files on reload is the known issue.
Outcome: return to the previous listening context without unnecessary file reselection.
Investigate: saved handles and permissions, cumulative picker batches, add/remove/reorder/clear,
restoring the selected audio source (currently SoundCloud restore always runs), and one missing
file failing the entire restore.
Acceptance: granted handles restore; permission-needed handles can be reconnected by user gesture;
names/order retained for unavailable files; saved source/context respects explicit routes;
no upload of local files; unavailable-storage cases clearly handled.
Open: opt-in browser-local copies for unsupported file-handle paths, storage limits/clear controls,
same-device versus account sync and paused/playing restoration.
Confirmed: restore selected visual, available audio and player settings; track position is unnecessary.

## Route the player by track, music list and visual playlist; prepare set model

Planning reference: D20. Project: Beta — Listening and community. Phase: Beta. Proposed priority: High.
Depends on: D21.

Owner: unassigned. State: defining.
Use the route shapes in the MVP spec: /track/<source>/<id>, /track_list/<id>,
/playlist/<id>, /set/<id>, retaining /vis/<id>.
Outcome: URLs establish the requested content and playback context.
Acceptance: direct load/reload, sharing and back/forward resolve correctly; explicit choices
are not replaced by restored state or automatic track visuals; changing visual does not
unconditionally destroy a track/list/set route; invalid/unavailable/private content handled.
Shared music lists use Visamp-hosted tracks only; no mixed lists with SoundCloud/local inputs.
Favourites are personal/non-shareable; playlists and sets are shareable.
Open: approved source IDs, privacy/default visibility and personal routes on another device.
Model sets now; authoring/playback and /set execution ship in an early post-MVP release.

## Model timed sets and plan early VJ follow-up

Planning reference: D21. Project: Roadmap — Post-MVP. Phase: Model in beta; release shortly after. Proposed priority: High.

Owner: unassigned. State: model defining; release after MVP, high-priority follow-up.
Outcome: a shareable set of visual/Visamp-hosted track pairings with timing, feeding into VJ mode.
MVP work: agree data/route contracts and extension points. Keep set authoring/playback out of beta.
Open: timing representation, transitions, manual overrides, editing and VJ controls.

## Visual transport controls and shortcuts

Planning reference: D22. Project: Beta — Listening and community. Phase: Beta. Proposed priority: Normal.
Depends on: D20.

Owner: unassigned. State: defining.
Outcome: Next/Previous visual buttons plus Space for next and Backspace for previous.
Acceptance: keyboard/buttons perform the same navigation; preserve current selection mode;
manual choice continues to take precedence over track defaults; inputs/editors/focused controls
retain normal keys; no accidental scrolling/navigation when a player shortcut is handled.
Confirmed: automatic stays automatic, manual stays manual. Explicit visual selection activates override.

## Repair signup and password-reset navigation

Planning reference: D23. Project: Beta — Listening and community. Phase: Beta. Proposed priority: High.

Owner: unassigned. State: reported broken.
Fergal reports Google/GitHub work, Create account and Forgot password links fail.
Email/password login is unverified and treated as blocked until signup works.
Acceptance: signup, confirmation, email login and reset verified locally and after deployment; preserve OAuth;
record tested outcomes instead of assuming email login itself is proven broken.

## Follow creators/artists and filter discovery

Planning reference: D24. Project: Beta — Listening and community. Phase: Beta. Proposed priority: High.
Depends on: D08.

Owner: unassigned. State: MVP requirement.
Outcome: follow/unfollow plus Following discovery filter.
Acceptance: correct target identities, persistent state, authenticated writes and matching content.
Open: relationship between user creator profiles and unclaimed music artists.
Notifications are later-release work. Current comments/replies suffice; no beta moderation project.
Public visuals appear immediately after the owner sets Public.

## Select v1 visuals and drive language gap analysis

Planning reference: D25. Project: Beta — Creation and assets. Phase: Beta. Proposed priority: High.

Owner: Fergal Hanley for collection selection; port implementation unassigned.
Fergal will choose quality visuals from a separate v1 repository (location pending).
Acceptance: selected inventory, per-visual missing capabilities, port validation and broader gap analysis.
Do not assume every historical visual is launch scope.
Keep real-music validator fixtures, scramble filter and extra ports as candidates to assess.

## Choose and propagate the visual-language name

Planning reference: D26. Project: Beta — Creation and assets. Phase: Beta. Proposed priority: Normal.

Owner: unassigned. State: decision pending.
Candidates include Viscript and VDSL; no chosen name yet.
Acceptance: agreed name checked, usage inventory, consistent code/site/docs terminology,
and explicit compatibility/migration handling for file extensions/APIs where needed.

## Asset library, upload and public contributions

Planning reference: D27. Project: Beta — Creation and assets. Phase: Beta. Proposed priority: High.

Owner: unassigned. State: MVP requirement, defining.
Support bitmap, SVG and 3D-model assets; uploads are private by default and usable only by the uploader.
Users can make assets public for reuse by other users, including in exported videos.
Upload requires confirmation of rights and implies reuse permission within its visibility scope.
Only admins can remove public assets from availability, optionally providing a replacement.
Removal applies everywhere, including visuals that already reference the asset.
Acceptance: discovery/selection, upload validation, private/public access enforcement, render loading,
and explicit rights/reuse acceptance. References in forks must respect asset access.
Open: exact formats, permission/attribution wording, quotas, replacement compatibility and AI asset access.

## Handle missing assets and enforce the 24-hour repair window

Planning reference: D28. Project: Beta — Creation and assets. Phase: Beta. Proposed priority: High.
Depends on: D27.

Owner: unassigned. State: MVP requirement, defining.
When an asset is removed, affected visuals skip that asset and show a warning.
If not fixed within 24 hours, automatically make each affected visual private.
Acceptance: affected references identified, rendering continues where possible, warning displayed,
repaired references clear the condition, and overdue unresolved visuals become private.
Open: timer semantics, handling multiple missing assets and republishing after repair.
Owner notifications for warnings/privacy changes are post-MVP; do not require a notification
system to implement the beta warning and visibility enforcement.

## Investigate silent editor failures

Planning reference: D29. Project: Beta — Creation and assets. Phase: Beta. Proposed priority: High.

Owner: Fergal Hanley, working with an agent. State: reproduction needed.
Reported: new code sometimes produces no error yet the visual fails to rerender.
Acceptance: reproducible example, fix, explicit failure diagnostics and validation that successful
edits replace the output. Fergal will investigate; do not claim an identified cause.

## Report multiple editor diagnostics

Planning reference: D30. Project: Beta — Creation and assets. Phase: Beta. Proposed priority: Normal.

Owner: unassigned. State: defining.
Current complaint: compiling/interpreting reports only the first error.
Acceptance: surface multiple independent errors where recoverable with useful locations;
clearly handle fatal errors and do not invent downstream diagnostics.

## Automatic AI provider choice with admin configuration

Planning reference: D31. Project: Beta — Creation and assets. Phase: Beta. Proposed priority: High.

Owner: unassigned. State: MVP requirement, defining.
Use ChatGPT first and fall back to Claude when unavailable. Exclude Qwen.
Replace user model picker with admin primary/fallback preference settings.
Acceptance: configured route used; simulate unavailable primary and working fallback;
both unavailable produces clear failure with no charge; a successful request incurs one fixed
credit charge even when automatic retries/provider fallback were required.
Open: error categories/timeouts/retry budget; do not conflate invalid code with unavailable provider.
Evaluate quality/cost to inform pricing and retain existing undo across AI edits.

## Later creation and community refinements

Planning reference: D32. Project: Roadmap — Post-MVP. Phase: Post-MVP. Proposed priority: Low.

Post-MVP: client-side history panel; GLSL/shader authoring context; publication notifications.
Existing comments remain sufficient; revisit expansion based on actual uptake.
Timed sets/VJ follow-up remains a separate high-priority post-MVP project.

## Prepare the existing environment and deploy the beta to Vercel

Planning reference: D33. Project: Beta — Launch operations. Phase: Beta. Proposed priority: High.

Owner: unassigned. State: not deployed; planning.
Current state: local application and one Supabase environment.
Outcome: working production deployment using the existing backend.
Scope: Vercel project/build setup, production configuration, domain, auth redirects,
storage/worker connectivity and payment webhook configuration as applicable.
Acceptance: deployed discovery/player, auth and core upload/payment flows checked; deployment
and recovery steps documented. Local/agent testing continues to use staging Mixpanel.
Configure main as the production deployment branch: merging an authorised PR automatically
deploys production, with no separate manual deployment step.
Acceptance includes verifying the main-to-production deployment trigger.
Open: production service configuration.
A separate staging stack is not an MVP dependency.

## Define and set up beta monitoring

Planning reference: D34. Project: Beta — Launch operations. Phase: Beta. Proposed priority: High.

Owner: unassigned. State: nothing currently configured; scope defining.
Outcome: visibility into application failures and service outages.
Define minimal error reporting, uptime checks and actionable alerts for the beta.
Send error/outage alerts to Slack; Discord remains the community/support channel.
Open: provider(s), specific Slack channel, coverage and operating cost.
Acceptance to finalise: representative error/outage reaches the chosen reporting/alert destination.
Do not assume monitoring or alerts already exist.

## Separate staging infrastructure after MVP

Planning reference: D35. Project: Roadmap — Post-MVP. Phase: Post-MVP. Proposed priority: Normal.
Depends on: D33.

Owner: unassigned. State: post-MVP.
Outcome: a separately deployed staging app/backend, with database, storage, worker and
integration separation defined during implementation.
Adopt Gitflow: develop automatically deploys to staging; main automatically deploys production.
Define release/hotfix branch handling and update agent PR-target guidance when activating the flow.
Until then MVP PRs continue targeting main.
Retain the staging/production Mixpanel separation already required for MVP.
