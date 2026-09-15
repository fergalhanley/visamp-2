# Direct MP3 uploads

Owner decision, 2026-09-15: invite artists, rely on the accepted upload agreement,
publish each verified MP3 immediately, and defer audio processing and moderation UX.
This supersedes VIS-86/VIS-87 processing and approval expectations; Linear cleanup
is deferred by the owner. The Slack agent reporting process is retired separately.

## Runtime

Browser → signed PUT to private R2 incoming key → completion API → private frozen
original → format/duration/checksum verification → identical playback copy → atomic
publication in Supabase. Three files can transfer concurrently; titles come from
MP3 tags or filenames and can be edited before transfer. Playback uses signed GET
URLs, including for originals supplied in MP3 format. No FFmpeg runs on this path.

The completion API streams to a temporary file, reads metadata and removes the
temporary file. It does not buffer entire recordings in server memory, decode or
rewrite audio. Client hashing is serialized to avoid three whole-file buffers.
A metadata parser checks MP3 codec and duration; this is basic format validation,
not a guarantee that every audio frame decodes without corruption.

Originals remain in the masters bucket for later processing; playback copies live
in the media bucket so the existing withdrawal/deletion mechanism continues to work.
Each completion attempt uses unique keys, because the original upload PUT URL is
still writable. The SQL row lock selects one completed track, even with concurrent
completion calls. On ambiguous DB failure retain candidates: a commit may have
succeeded despite losing the response. The orphan cleanup command removes unused
media and candidate originals after seven days, with a dry run by default.

## Rollout

1. Run local checks, then apply `20260915120000_direct_mp3_uploads.sql` to the target
   database before deploying the updated web app. Do not reset a shared database.
2. Deploy the web app through the ordinary develop → main release process.
   No production deployment or migration is implied by committing this change.
3. Verify R2 credentials permit HEAD/GET/PUT/CopyObject on both private buckets.
   Keep browser PUT and playback GET/HEAD CORS origins configured for the deployed
   site and any local verification origin. No new public bucket is required.
4. Check `audio_uploads` for old `queued`/`processing` lossless jobs. Drain valid old
   jobs with the legacy worker, or explicitly resolve them with their owners. Do not
   delete them or pretend a lossless source is MP3. Existing draft tracks remain drafts.
5. Once the old queue is resolved and a batch passes the upload/playback check,
   disable the Railway audio worker cron/service. Preserve the visual validator.

An existing pending self-accepted licence becomes active on the next agreement
acceptance; manually recorded licences and existing tracks are not bulk-published.
Terminated self-accepted licences stay terminated. The agreement text/version has
not changed; its recorded grants remain intact.

## Verification

- `pnpm --filter @visamp/web test:mp3`
- `pnpm --filter @visamp/web test:uploads`
- `pnpm --filter @visamp/web test:tags`
- `pnpm --filter @visamp/web test:rpc-errors`
- `pnpm --filter @visamp/web lint`
- `pnpm --filter @visamp/web check-types`
- `pnpm --filter @visamp/web build`
- Run `supabase/tests/direct_mp3_uploads.sql`, `self_upload_agreement.sql` and
  `upload_limits.sql` against a local database with the migration applied; they roll back.
- Browser: select a batch, verify three simultaneous transfers and progress, cancel
  or interrupt one, retry only it, and play completed tracks before the batch ends.
  Check desktop and mobile layouts, MP3 seeking, legacy playback, and withdrawal.

## Deferred backlog

- Admin controls for suspending individual tracks or an uploader's entire catalogue,
  preventing additional publication, and recording reasons.
- Public track dispute link and form, with track reference, contact details, reason,
  supporting information and a notification to a configured email address.
- Resuming file transfers after closing the tab; future audio processing/renditions.

## Verification recorded 2026-09-15

- Production Turbopack build, TypeScript, upload/metadata/queue tests and SQL
  acceptance tests passed. ESLint has no errors; the existing landing-page image
  warning remains unrelated to this change.
- Used a schema-only clone of the local database, a local authenticated test artist
  and synthetic sine-wave recordings; the production database was not changed.
- Four browser uploads reached Available; instrumentation recorded a maximum of
  three simultaneous XHR transfers. A fifth upload with a simulated lost completion
  response recovered on Retry with the XHR count unchanged. Cancelling an
  active transfer reported cancellation and released its admission slot.
- Real R2 verification, MP3 publication, playback and seeking passed. A separate
  normal Chromium check passed signed range requests, CORS and Web Audio analysis
  from the allowed localhost:3000 origin. The isolated upload UI ran on port 3002
  with browser CORS enforcement disabled only for that test session, because R2
  does not allow that development origin. No bucket CORS settings were changed.
- Withdrawal through the admin API returned success, removed the playback object,
  returned 410 for further playback requests and retained the archived original.
- Mobile upload rows were visually checked at 390 px. Actual Safari/iOS device
  playback and the deployed upload flow remain release verification tasks.
