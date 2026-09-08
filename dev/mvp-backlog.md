# MVP ticket drafts

These are repository drafts, not created Linear issues. Linear IDs and live statuses will
be added on transfer; thereafter Linear is authoritative. Owner names below record Fergal's
instructions, not verified external assignments. Product reference: [MVP specification](mvp.md).

## Landing experience and discovery

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

Owner: unassigned. State: defining.
Outcome: easier browsing and account/navigation access without obscuring visuals at rest.
Scope: fixed panels approximately 2x current desktop width; top bar with navigation, login,
profile/account, Create Vis and Fork Vis. Top-edge hover triggers fade-in; bar does not overlap panels.
Acceptance: bar follows agreed reveal/hide behaviour; existing player controls continue to work;
logged-in/out states supported; desktop behaviour verified.
Open: navigation links, hide timing/focus, smaller-screen constraints and touch design.

## Featured artist configuration and entry routing

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

Owner: unassigned. State: awaiting artist details and source material.
Outcome: Gereon's approved tracks are available as initial featured music.
Fergal reports permission for site use. Record exact artist identity, music sources and permission;
create the catalogue/licence record and validate published playback.
Acceptance: accurate credit, actual permission recorded, tracks playable and available for featuring.
Open: exact artist identity/links, tracks, documents and scope of permission.
Do not fabricate records or extend site permission to social/video/live distribution.

## Admin artist and licence onboarding

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

Owner: Fergal Hanley. State: needs user validation.
Cover sign-in/signup/reset, username/avatar/bio, ownership, public/private visuals,
likes, comments, favourites, forks and attribution.
Acceptance: outcomes and reproduction steps recorded; resulting bugs/change requests split
into scoped tickets. Presence of code does not count as a passing test.

## Validate artist uploads and admin

Owner: unassigned. State: untested by Fergal.
Cover authorised upload, rejection/error recovery, processing worker, automatic publication,
metadata edit, playback, unpublish/withdrawal and admin permissions.
Change PoC draft/admin-review default: publish after processing and permission checks.
Artist controls include title, artwork, description, preferred visual and withdrawal.
Acceptance: end-to-end results with real stage configuration recorded; failures become tickets.
Open: who executes validation and whether stage workers/storage are already deployed.

## Define user/creator/music-artist presentation

Owner: unassigned. State: defining.
Outcome: one user can create visuals and music, with clear attribution and artist pages.
Use contextual Creator/Artist presentation, preserving artists without accounts.
One public user profile has Visualisations and Music tabs when both apply.
Acceptance: terminology, profile routes, claims/ownership and both-content presentation agreed;
migration plan builds on existing optional music_artists.claimed_by.

## Define and implement credits with Stripe

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
Acceptance to finalise: stage purchase -> verified payment -> credit allocation -> metered use,
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

Owner: unassigned. State: defining.
Outcome: trustworthy listening, creation, community and conversion measurement from beta.
Acceptance: separate stage/prod projects; dev/tests cannot silently target prod;
agreed events/identity validated in stage; documented internal-user filtering and consent behaviour.
Open: event dictionary, returning-user measures, listening-duration rules and configuration.

## Define mobile/tablet viewer layout

Owner: unassigned. State: defining.
Outcome: comfortable touch playback for launch, with desktop-only creation.
Acceptance: agreed navigation/panel/control layout; portrait/landscape checks;
editor entry handled clearly; audio/visual behaviour tested on agreed browser/device matrix.

## Implement track-based video export

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

Owner: unassigned. State: investigation required before export implementation.
Prefer client-side rendering; fall back to server-side if required quality/reliability is not feasible.
Evaluate representative full tracks and complex visuals at the agreed output settings, including
audio/video sync, encoding/muxing, browser support, memory use and interrupted exports.
Acceptance: recorded feasibility evidence and implementation choice; if server rendering is needed,
define cost controls and feed estimated costs into credit pricing.
Client-rendered exports with the Visamp watermark are free; server-rendered exports consume credits.
Browser rendering feasibility remains to be established.

## Publish site information and establish social accounts

Owner: unassigned. State: defining.
Replace policy/licensing placeholders; update About/beta messaging and copyright details.
Set up approved accounts using admin@visamp.io and wire real links; include Discord,
Twitch/YouTube, X, Instagram, Bluesky and TikTok in planning.
Acceptance: final destinations/content verified and no accidental placeholder links.
Open: handles, account ownership, publication approvals and content schedule.

## Company formation, grants and founder content

Owner: Fergal Hanley (founder decisions); execution unassigned. State: defining.
Track company setup, funding eligibility/deadlines, matching requirements, evidence and budget.
Plan reusable visual sessions, livestreams and social clips starting at beta.
Acceptance: bounded first-month plan, rights-cleared content sources, cost tracking and
measurable recruitment/usage outcomes. No assumed grant award or revenue-sharing launch.

## Restore local files and listening sessions after reload

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

Owner: unassigned. State: model defining; release after MVP, high-priority follow-up.
Outcome: a shareable set of visual/Visamp-hosted track pairings with timing, feeding into VJ mode.
MVP work: agree data/route contracts and extension points. Keep set authoring/playback out of beta.
Open: timing representation, transitions, manual overrides, editing and VJ controls.

## Visual transport controls and shortcuts

Owner: unassigned. State: defining.
Outcome: Next/Previous visual buttons plus Space for next and Backspace for previous.
Acceptance: keyboard/buttons perform the same navigation; preserve current selection mode;
manual choice continues to take precedence over track defaults; inputs/editors/focused controls
retain normal keys; no accidental scrolling/navigation when a player shortcut is handled.
Confirmed: automatic stays automatic, manual stays manual. Explicit visual selection activates override.

## Repair signup and password-reset navigation

Owner: unassigned. State: reported broken.
Fergal reports Google/GitHub work, Create account and Forgot password links fail.
Email/password login is unverified and treated as blocked until signup works.
Acceptance: signup, confirmation, email login and reset complete in stage; preserve OAuth;
record tested outcomes instead of assuming email login itself is proven broken.

## Follow creators/artists and filter discovery

Owner: unassigned. State: MVP requirement.
Outcome: follow/unfollow plus Following discovery filter.
Acceptance: correct target identities, persistent state, authenticated writes and matching content.
Open: relationship between user creator profiles and unclaimed music artists.
Notifications are later-release work. Current comments/replies suffice; no beta moderation project.
Public visuals appear immediately after the owner sets Public.

## Select v1 visuals and drive language gap analysis

Owner: Fergal Hanley for collection selection; port implementation unassigned.
Fergal will choose quality visuals from a separate v1 repository (location pending).
Acceptance: selected inventory, per-visual missing capabilities, port validation and broader gap analysis.
Do not assume every historical visual is launch scope.
Keep real-music validator fixtures, scramble filter and extra ports as candidates to assess.

## Choose and propagate the visual-language name

Owner: unassigned. State: decision pending.
Candidates include Viscript and VDSL; no chosen name yet.
Acceptance: agreed name checked, usage inventory, consistent code/site/docs terminology,
and explicit compatibility/migration handling for file extensions/APIs where needed.

## Asset library, upload and public contributions

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

Owner: unassigned. State: MVP requirement, defining.
When an asset is removed, affected visuals skip that asset and show a warning.
If not fixed within 24 hours, automatically make each affected visual private.
Acceptance: affected references identified, rendering continues where possible, warning displayed,
repaired references clear the condition, and overdue unresolved visuals become private.
Open: timer semantics, handling multiple missing assets and republishing after repair.
Owner notifications for warnings/privacy changes are post-MVP; do not require a notification
system to implement the beta warning and visibility enforcement.

## Investigate silent editor failures

Owner: Fergal Hanley, working with an agent. State: reproduction needed.
Reported: new code sometimes produces no error yet the visual fails to rerender.
Acceptance: reproducible example, fix, explicit failure diagnostics and validation that successful
edits replace the output. Fergal will investigate; do not claim an identified cause.

## Report multiple editor diagnostics

Owner: unassigned. State: defining.
Current complaint: compiling/interpreting reports only the first error.
Acceptance: surface multiple independent errors where recoverable with useful locations;
clearly handle fatal errors and do not invent downstream diagnostics.

## Automatic AI provider choice with admin configuration

Owner: unassigned. State: MVP requirement, defining.
Use ChatGPT first and fall back to Claude when unavailable. Exclude Qwen.
Replace user model picker with admin primary/fallback preference settings.
Acceptance: configured route used; simulate unavailable primary and working fallback;
both unavailable produces clear failure with no charge; a successful request incurs one fixed
credit charge even when automatic retries/provider fallback were required.
Open: error categories/timeouts/retry budget; do not conflate invalid code with unavailable provider.
Evaluate quality/cost to inform pricing and retain existing undo across AI edits.

## Later creation and community refinements

Post-MVP: client-side history panel; GLSL/shader authoring context; publication notifications.
Existing comments remain sufficient; revisit expansion based on actual uptake.
Timed sets/VJ follow-up remains a separate high-priority post-MVP project.
