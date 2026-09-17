This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

The app uses system fonts and the checked-in VisAmp logo assets.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## AI editor generation

The edit page includes an AI prompt composer above CodeMirror. Generation is
server-side, disabled by default, and requires the AI guardrail migration plus:

```dotenv
AI_GENERATION_ENABLED=true
AI_ABUSE_HMAC_KEY=<a-long-random-secret>
AI_RATE_WINDOW_SECONDS=3600
AI_RATE_LIMIT_PER_USER=10
AI_RATE_LIMIT_PER_IP=30
AI_CONCURRENT_LIMIT_PER_USER=2

OPENAI_API_KEY=

AI_VALIDATOR_URL=http://validator:4318
```

Generation uses OpenAI GPT-5.6 Sol through the Responses API. There is no
provider picker or fallback. Optional settings are `OPENAI_BASE_URL`,
`OPENAI_ORGANIZATION`, and `OPENAI_PROJECT`.

Controls are `AI_ATTEMPT_BUDGET` (default `3`), `AI_MAX_OUTPUT_TOKENS`
(default `8192`, includes reasoning), `AI_MODEL_TIMEOUT_MS` (default `60000`),
and `AI_VALIDATOR_TIMEOUT_MS` (default `20000`).

`AI_VALIDATOR_URL` must point to the private render-validator service. It must
not be exposed to browsers or the public internet.

Rate limits are enforced atomically in Postgres per authenticated user and per
HMAC-pseudonymised client address. AI requests cost 100 credits on success, with
automatic validation retries included. Failed requests are free. Credit-exempt
profiles retain normal rate limits. Verified signup grants, discretionary expiry,
reservations and Stripe purchases use an allocation ledger.

The editor displays available credits and links to `/account/billing` for USD
purchases and history. US$1 buys 100 credits; presets are $5, $20 and $50, with a
$2 custom minimum. See [AI credits and Stripe](../../dev/ai-credits-and-stripe.md)
for the migration, grant/exemption SQL, pricing assumptions, Stripe setup and tests.

## Email authentication CAPTCHA

Email sign-in, signup, and password-reset requests use Cloudflare Turnstile.
Set `NEXT_PUBLIC_TURNSTILE_SITE_KEY` in the web deployment, enable Turnstile in
Supabase Auth's bot-protection settings with the matching secret, and set
`SUPABASE_AUTH_CAPTCHA_SECRET` when running the local Supabase stack. OAuth does
not use the email form's widget.

The widget uses Next Script's `onReady` to render after the API loads and an
effect to recreate it when the cached API is already available. Do not wrap
rendering in `turnstile.ready()`: it rejects async/defer script loading and
crashes when switching between authentication forms. Widget failures must
clear the token and stay within the panel; submitting still requires a valid
CAPTCHA token.

## VisAmp-hosted audio

Hosted audio uses private Cloudflare R2 buckets and Supabase catalogue rows.
Apply `supabase/migrations/20260905090000_hosted_audio.sql`, then bootstrap the
first administrator through trusted SQL:

```sql
insert into public.app_admins (user_id) values ('<auth-user-uuid>');
```

Create the artist and its signed licence through the same trusted SQL/admin
environment before ingesting. The licence document key refers to an object in
the private `music-licences` Supabase Storage bucket created by the migration:

```sql
with artist as (
  insert into public.music_artists (slug, name)
  values ('some-artist', 'Some Artist')
  returning id
)
insert into public.licences (
  music_artist_id, status, document_key, signed_at, effective_from,
  grants_hosting, grants_streaming, grants_transcoding, grants_sync,
  warrants_master, warrants_publishing
)
select id, 'active', '<licence-document-key>', now(), current_date,
       true, true, true, true, true, true
from artist
returning id;
```

Configure the server-only values shown in `.env.example`. Keep
`media-visamp-io` private with no custom domain and apply
`config/r2-media-cors.json` as its CORS policy. Create a separate private
`visamp-masters` bucket; masters are uploaded directly as `STANDARD_IA`.

The local ingest command requires `ffmpeg` and `ffprobe`:

```bash
pnpm ingest \
  --artist-slug some-artist \
  --licence <licence-uuid> \
  --input ./master.wav \
  --artwork ./art.png \
  --title "Track title"
```

Reconciliation is dry-run by default. Review its output before enabling
deletion:

```bash
pnpm audio:cleanup
pnpm audio:cleanup --execute
```

The playback endpoint returns JSON and presigned URLs only. Audio bytes travel
directly from R2 to the browser and are never proxied through Next.js.

## Site pages and artist uploads

The public landing page is `/`; the full-screen player is `/player` and
visualisation permalinks remain `/vis/<id>`. The landing gallery fetches 24
public thumbnails at a time with a `created_at, id` cursor (no source scripts).
Site navigation uses document navigation when crossing canvas-owning routes
because the WASM engine is a singleton.

Social account URLs live in `lib/site.ts`. Null entries display “coming soon”.
Cookie, privacy, terms and licensing pages are explicit content placeholders;
replace them with approved documents before public launch.

User attribution now uses usernames only. The legacy `profiles.display_name`
column is retained for compatibility, but is not editable or used for display,
and new OAuth signups no longer populate it.

### Upload setup

1. Apply `20260907180000_artist_audio_uploads.sql` after the preceding migrations.
2. Keep both R2 buckets private. Apply `config/r2-masters-cors.json` to the
   physical bucket in `R2_MASTERS_BUCKET`. This adds **PUT only** for the app
   origins: it does not grant public access or browser downloads of masters.
   Media CORS stays in `config/r2-media-cors.json`.
3. On the masters bucket, add an object-expiration lifecycle rule **restricted
   to the `incoming/` prefix**, after 2 days, for abandoned/replayed submissions.
   Do not expire permanent masters. Incoming uploads explicitly use Standard;
   the final ingestion uploads use Infrequent Access.
4. Provision site administrators in `app_admins` through trusted database
   administration. Link an artist's auth user ID in `music_artists.claimed_by`
   and record their signed, active licence with all necessary grants and
   warranties. Artist/rights onboarding in the admin UI is still a placeholder.
5. On a worker machine with `ffmpeg`, `ffprobe` and the web app's server
   environment available, run `pnpm --filter @visamp/web audio:process`.
   This drains at most 10 jobs per run; schedule repeated runs for production.
   Do not run the worker inside a Next.js/Vercel request. FFmpeg subprocesses
   have a three-minute timeout per operation and allow only local file/pipe
   protocols. Use a maintained FFmpeg installation in an isolated worker.

Artists submit from `/upload`; admins use that page to upload for any artist.
The server verifies ownership and the current licence, then issues a 15-minute
presigned PUT for one exact file with its content length signed. Files are
limited to 250 MB, WAV/FLAC/AIFF, 30 minutes and at least 44.1 kHz.
Admission is atomic: at most 3 pending jobs and 20 submissions per user per day.

The completion endpoint checks the stored size, ownership and licence again.
The worker verifies byte count and SHA-256, reuses the existing encoding
pipeline, and leaves tracks in draft. Ingestion checks the licence at processing
time and database publication checks it again. Admins can preview, edit title/
album, publish or withdraw through `/admin`. Withdrawal removes derived
playback files and retains the master. Dashboard counts are live database
counts; analytics and onboarding tools are reserved for later.

The worker claims jobs with `FOR UPDATE SKIP LOCKED`. A process crash deliberately
does not auto-reclaim an in-flight job. After confirming its worker has stopped,
an operator can reset that job from processing/failed to queued, provided its
temporary source still exists. The stable upload slug identifies partial
ingestion on retry. After the two-day source expiry, request a new upload.

Run the read-only browser smoke checks against a running web server:
`VISAMP_WEB_TEST_URL=http://localhost:3001 pnpm --filter @visamp/validator test:site`.
The public tests use a fresh anonymous browser. To also run the authenticated
UI fixtures, load the web environment:
`VISAMP_WEB_TEST_URL=http://localhost:3001 node --env-file=../web/.env.local --test src/site-authenticated.test.mjs`
from `apps/validator`. Those fixtures intercept all browser auth, API and
storage requests; they never use a real account or modify production data.

Failed file transfers release their pending slot through an ownership-checked
cancellation endpoint. Temporary completion failures can retry submission
without transferring the file again; expired submissions allow a fresh upload.

## Editor autosave

`useEditorAutosave` keeps the last successfully written title/source/visibility
snapshot. An edit can save only when the viewer can edit and the current source
matches the source of a successful compile. The first eligible edit saves
immediately; subsequent attempts wait eight seconds after the previous attempt
finishes. Further typing updates the pending snapshot without moving that deadline.

Completion always rechecks for unsaved edits, including edits made during a write
and failed writes. Failures appear in the status strip and editor log and retry
on the same throttle. A 20-second timeout aborts a stalled request. Unmounting
cancels the timer and aborts an active request. Saving requires a returned row;
a denied/zero-row update must not be reported as saved.

The document write precedes optional thumbnail refresh. Thumbnail work has a
five-second limit and reports a warning on failure, while the document remains
saved. Pinned thumbnails are not automatically refreshed.

Run `pnpm --filter @visamp/web test:editor` for React hook and persistence tests.
For browser regression verification, delay a document PATCH, edit again while
“Saving…” is visible, then allow the request to finish. Without further input,
the latest text must be written after the throttle and survive reload. Also
verify a failed PATCH retries, an invalid script stays blocked, and a stalled
thumbnail upload leaves the document saved with a warning. Use a disposable
draft/account for fault injection.

## Email signup and hosted redirects

Signup requires matching password/confirmation fields and a fresh CAPTCHA token.
Successful requests replace the form with an “Account created” confirmation;
Google/GitHub options appear only on Sign in. Failures retain the form for retry.

In the production Supabase dashboard, **Authentication → URL Configuration**:

- Set Site URL to `https://www.visamp.io` (never localhost for production).
- Keep the existing `/auth/callback**` redirect entries for OAuth and recovery.
- Add `https://www.visamp.io/auth/confirm**` and
  `https://visamp.io/auth/confirm**` for signup confirmation, including its `next`
  query parameter. Add `http://localhost:3000/auth/confirm**` for local testing
  against this project if needed.

The default confirmation email template uses `{{ .ConfirmationURL }}`.
Supabase verifies that link and returns a PKCE `code` to `/auth/confirm`, which
exchanges it for session cookies. Custom templates using `token_hash` and `type`
are also supported. Default PKCE links must be opened in the browser that started
signup, where the verifier is stored. Configure a verified SMTP sender domain in
the same Resend account as the SMTP password/API key.

An unapproved redirect falls back to Site URL, explaining emails pointing to
localhost even when signup originated on production. Deploy the PKCE-capable
confirmation route before enabling its redirect entry. Request a fresh email
after updating settings; already-sent URLs do not change. Validate a real signup,
confirmation and subsequent sign-in after deployment; automated tests mock Auth
and do not send emails or create production accounts.

Reference: https://supabase.com/docs/guides/auth/redirect-urls
