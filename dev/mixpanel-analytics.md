# Web analytics contract

Definition: [VIS-32](https://linear.app/visamp/issue/VIS-32/define-mixpanel-events-identity-and-beta-metrics).
Implementation and live verification: [VIS-33](https://linear.app/visamp/issue/VIS-33/implement-mixpanel-environment-routing-and-beta-dashboards).

This is the implementation contract approved in the September 18, 2026 task
conversation. It describes intended behaviour, not instrumentation already shipped.
Listening and creation have equal prominence in the beta dashboard. Include
Fergal's real production activity; there is no account-based staff exclusion.

## Environment routing

- Use two different Mixpanel projects: staging and production. Keep the existing
  single Supabase environment; analytics does not require another application or backend.
- Local development, CI, previews and automated/agent sessions use staging.
  Real usage on the production deployment uses production.
- Select deployment environment explicitly. `NODE_ENV=production` alone is
  insufficient: local production builds and previews must remain staging.
- Configure separate staging/production tokens and project data regions. No
  fallback from missing staging configuration to the production token. Equal
  tokens or an unknown region disable tracking and produce a configuration diagnostic.
- Browser production selection also requires the configured canonical production
  hostname. Automated checks of production must explicitly select staging before
  analytics initialisation; never rely on the tester's account ID.
- Carry the resolved environment with asynchronous work and checkout metadata.
  The shared backend must not infer it from the Supabase project or user ID.
  Validate this metadata server-side; missing/invalid context means no analytics.
- Browser and server use the same project/region for a given operation.
  Missing configuration never prevents playback, saving, uploading or payment.

## Consent and identity

- Analytics is opt-in. Before acceptance, do not initialise tracking, create an
  analytics identifier or send browser/server analytics events. Operational data
  necessary for purchases, credits and uploads remains independent of analytics.
- Offer accept and decline plus an accessible persistent analytics-preferences
  control. Remember the choice and allow withdrawal. Update privacy/cookie copy.
- Withdrawal stops new events, clears analytics identity/persistence and invalidates
  queued analytics where possible. Do not replay activity from before consent.
- Propagate consent to server operations. Recheck consent before delivery of
  delayed events; do not infer it from authentication or a successful payment.
- Anonymous consented activity gets an SDK device ID. Identify authenticated users
  with the verified Supabase UUID, never email, username or artist ID. Link prior
  consented anonymous activity when identifying.
- Reset on logout/account switch before another user's events. Initial session
  restoration and token refresh are not signup/login events. An actual completed
  authentication flow produces `login_completed`; a newly created account produces
  `signup_completed` only once. Consent granted later does not backfill signup.
- Optional profile properties: signup date and independent creator/uploader flags.
  Do not send email, artist names, code, prompts, filenames, microphone content,
  signed URLs, raw search terms or raw errors.
- Route properties use templates (e.g. `/edit/[id]`). Strip arbitrary query strings
  and fragments. Allow only reviewed campaign fields; use referrer domain only.
- Disable autocapture, session replay, automatic page tracking and automatic URL/
  referrer enrichment that bypasses these rules. Explicitly prevent IP geolocation.

## Event envelope and delivery

Use one typed wrapper with an allowlisted property schema. Every event has
`schema_version=1`, `environment`, `release`, original timestamp, a unique event ID,
and identity. Browser events also have route template and authenticated status.
IDs identify entities; avoid dynamic event names or free-form text properties.

Use a single authoritative producer for each outcome. Server outcomes are recorded
after the business operation commits. Retriable server delivery uses an outbox;
retries preserve the event ID (`$insert_id`), timestamp and identity. Client retries
of an operation must not generate duplicate success events. Never wait for Mixpanel
to decide whether a user operation succeeded.

Correlate AI requests, uploads, playback sessions and checkouts using their own IDs.
An analytics failure must not obscure an application error or expose user data in logs.

## Event dictionary

Properties below supplement the envelope. Emit actions on confirmed success unless
the name explicitly describes starting, requesting, choosing or failing.

| Events | Producer | Properties and trigger |
| --- | --- | --- |
| `page_viewed` | Browser | Route template, reviewed campaign fields, referrer domain; initial entry and completed route transitions, including Back/Forward; not rerenders |
| `cta_clicked` | Browser | Stable CTA name and placement; key navigation/conversion CTAs only |
| `signup_started`, `signup_completed`, `login_completed`, `logout_completed` | Auth flow | Method and entry point; completion rules above, logout before identity reset |
| `search_performed` | Browser | Content type, result count, source panel; once per settled query/results change, no search text |
| `content_selected` | Browser | Content type, entity ID, result position, source panel; intentional selection |
| `playback_started` | Audio controller | Playback session ID, source type, hosted track/artist IDs when available; actual playback start, not play-button click |
| `playback_summary` | Audio controller | Session ID, source type, track ID, incremental listened seconds, segment sequence, reason |
| `playback_failed` | Audio controller | Session ID, source type, track ID, normalised failure category; no raw message/URL |
| `visualisation_loaded` | Player | Visualisation ID, source panel, load duration; successful initial render after selection, not every frame |
| `audio_source_changed`, `visualisation_mode_changed` | Browser | Previous/new enum value; user-initiated changes, not state hydration |
| `favourite_changed` | Browser | Content type, ID, added/removed; confirmed backend success, independent of optimistic UI |
| `playlist_created`, `playlist_item_changed` | Browser | Playlist type/ID, item ID, added/removed, resulting count; no playlist name |
| `editor_opened` | Browser | Visualisation ID if existing, entry method; once after document load |
| `visualisation_created`, `visualisation_saved`, `visualisation_published`, `visualisation_forked` | Save flow | ID, source ID for forks, creation method, visibility, active editing duration; confirmed persistence |
| `generation_requested`, `generation_completed`, `generation_failed` | Server | Request ID, model, generate/repair, internal attempt count, duration, actual charged credits, normalised failure category |
| `generation_recovery_selected` | Browser | Request ID, edit/accept/fix/cancel/acknowledge; selection only, not proof of another generation |
| `artist_created`, `artist_name_conflict` | Server | Artist ID when available; successful claim or duplicate-name rejection, no submitted name |
| `track_upload_started`, `track_upload_completed`, `track_upload_failed` | Server | Upload/artist/track IDs, byte size, duration, artwork/album flags, normalised stage/category; completed means published/playable, not merely transferred |
| `track_removed` | Server | Track and artist IDs; completed withdrawal |
| `billing_viewed` | Browser | Entry point; billing UI visible |
| `checkout_started`, `checkout_failed` | Server | Checkout ID when created, package ID, amount in minor units, currency, credits, normalised failure stage/category |
| `credits_purchased` | Stripe webhook/outbox | Checkout ID, package ID, paid amount in minor units, currency, granted credits; only after verified payment and persisted credit grant |

`generation_requested` counts accepted, billable user operations, not internal model
retries or rejected insufficient-credit requests. Each operation has exactly one
terminal completed/failed outcome. Completed means code passed the required checks.
Accepting failed code is a recovery selection, not a successful generation. A paid
"Try to fix" operation gets a new request ID and links the original request ID.

For editing, create/fork counts once per new record. Publish counts a transition
from non-public to public; repeated saves of public code are saves, not publications.
Coalesce autosave activity into at most one `visualisation_saved` per document per
30 seconds, and flush pending confirmed changes on editor exit where possible.
Use distinct visualisation IDs for dashboard publication totals so republishing
does not inflate the number of published works.

## Listening and retention definitions

- A playback session starts on actual playback and ends on track/source change or
  page exit. Pause/resume retains the session ID; a new play after ending gets a new ID.
- Accumulate monotonic elapsed time only while audio is playing and not buffering,
  muted or at zero volume. Seeking does not add track position to listening time.
  Background playback counts when playback continues. Microphone capture is a
  separate source and excluded from listening totals.
- Emit incremental summaries every 30 seconds of eligible listening and flush
  outstanding seconds on pause, end, change and page exit. Checkpoint and final
  summaries never overlap. Use unique segment IDs for deduplication.
- Timer suspension, lost page-exit requests, blocked analytics and no consent can
  cause undercounting. Do not claim exact listening time or infer missing hours
  from one delayed timer callback. Report measured consented activity.
- Active listener: distinct person with at least 30 measured listening seconds
  in the reporting day. Include hosted and local audio, with separate source breakdowns.
- Listening time: sum incremental eligible seconds divided by 60 for minutes.
- Active creator: distinct person with a confirmed create, save, fork, publish or
  accepted generation request in the reporting day. Merely opening the editor does not qualify.
- Returning user: a person active on a day who had a tracked page view or qualifying
  listening/creation event on an earlier UTC day. Anonymous users can be measured
  only within the lifetime of their consented device identity.
- D1/D7/D30 listener and creator retention: exact UTC day offsets from the first
  qualifying listener/creator day, returning to the same qualifying activity.
  Use separate cohorts; a person may belong to both. Not rolling-window retention.

## Beta dashboard and verification

Use UTC reporting days and production/staging filters. Show listening and creation
side by side; label metrics as consented tracked activity, not all customers.

| Report | Definition |
| --- | --- |
| Active listeners and listening minutes | Definitions above, daily/weekly trend and source breakdown |
| Active creators | Definition above, alongside listeners |
| Returning users and retention | Returning user trend plus listener/creator D1, D7, D30 cohorts |
| Successful AI requests | Distinct completed request IDs; completion rate over terminal outcomes, failure categories, repair outcomes, latency, charged credits |
| Published visualisations | Distinct IDs with a publish event in period |
| Music uploads | Distinct track IDs with upload-completed event; failures by stage |
| Credit purchases | Distinct paid checkout IDs and summed actual paid amount, separated by currency; not net revenue/refunds |
| Activation | Visit → actual playback → 30-second listening threshold → signup, and editor → generation → save → publish funnels |
| Upload and billing conversion | Artist created → upload completed → playback; billing viewed → checkout started → credits purchased |

Staging verification must cover initial navigation/Back, Strict Mode/remount
duplicates, anonymous-to-account identity, logout/account switch, auth refresh,
consent decline/accept/withdrawal, playback pause/seek/buffer/mute/background,
autosave coalescing, generation failure/recovery, upload processing, webhook replay,
outbox retry, missing configuration, equal tokens and local production builds.
Verify event payloads and dashboard numbers against known fixtures, not just HTTP 200s.
Exercise production-host automated routing with staging selected. Confirm that a
real consented production session, including Fergal's, reaches production only.

Live project tokens, data regions and dashboard access are required to complete
VIS-33 verification. Repository tests alone do not satisfy that acceptance criterion.

Implementation references: [browser SDK](https://docs.mixpanel.com/docs/tracking-methods/sdks/javascript),
[identity](https://docs.mixpanel.com/docs/tracking-methods/id-management/identifying-users-simplified),
[event deduplication](https://docs.mixpanel.com/reference/event-deduplication).
