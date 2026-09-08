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
Open: topmost/popularity definitions, featured track ordering, multiple artists and exact restore fields.

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
Open: claiming verification, agreement fields and management of multiple artist identities.

## Validate accounts and community

Owner: Fergal Hanley. State: needs user validation.
Cover sign-in/signup/reset, username/avatar/bio, ownership, public/private visuals,
likes, comments, favourites, forks and attribution.
Acceptance: outcomes and reproduction steps recorded; resulting bugs/change requests split
into scoped tickets. Presence of code does not count as a passing test.

## Validate artist uploads and admin

Owner: unassigned. State: untested by Fergal.
Cover authorised upload, rejection/error recovery, processing worker, draft preview,
metadata edit, publish, playback, withdrawal and admin permissions.
Acceptance: end-to-end results with real stage configuration recorded; failures become tickets.
Open: who executes validation and whether stage workers/storage are already deployed.

## Define user/creator/music-artist presentation

Owner: unassigned. State: defining.
Outcome: one user can create visuals and music, with clear attribution and artist pages.
Consider Creator for visuals and Artist for music; preserve artists without accounts.
Acceptance: terminology, profile routes, claims/ownership and both-content presentation agreed;
migration plan builds on existing optional music_artists.claimed_by.

## Define and implement credits with Stripe

Owner: unassigned. State: defining.
Outcome: users can understand credit costs, obtain signup credits and purchase additional usage.
Build on the AI ledger; define packs/pricing, balance/history UI, failures/refunds,
creator grants, expiry and any subscription scope.
Acceptance to finalise: stage purchase -> verified payment -> credit allocation -> metered use,
including duplicate-payment-event handling and failed generation behaviour.

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

## Define video export and DSL/AI launch readiness

Owner: unassigned. State: defining; split after discovery.
Export: source/permission rules, video formats, aspect ratios, duration, audio sync,
render location, costs, failure handling and creator attribution.
DSL/AI: bounded launch feature set, known deficiencies, reference visuals and
quality/reliability/cost evaluation. Preserve old unresolved work on versioned real-music
validator fixtures, scramble filter and additional codex ports as candidates, not automatic scope.

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
same-device versus account sync, track position and paused/playing restoration.

## Route the player by track, music list, visual playlist and set

Owner: unassigned. State: defining.
Use the route shapes in the MVP spec: /track/<source>/<id>, /track_list/<id>,
/playlist/<id>, /set/<id>, retaining /vis/<id>.
Outcome: URLs establish the requested content and playback context.
Acceptance: direct load/reload, sharing and back/forward resolve correctly; explicit choices
are not replaced by restored state or automatic track visuals; changing visual does not
unconditionally destroy a track/list/set route; invalid/unavailable/private content handled.
Open: approved source IDs, music-list persistence/publicity, unavailable local-file references,
set timing/authoring and beta scope. Do not assume every route is a funded beta feature yet.
