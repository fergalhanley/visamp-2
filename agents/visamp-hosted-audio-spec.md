# Hosted music: implementation baseline and MVP decisions

Replaces the PoC technical proposal. Reviewed at f224eeebd0fa003cda6c5fbd65e01eb3ac3f9a7e.
Product authority: [MVP specification](../dev/mvp.md). Work: [ticket drafts](../dev/mvp-backlog.md).

## Direct MP3 uploads (2026-09-15)

Owner-approved simplification supersedes the lossless-master processing flow:

- Select multiple MP3s, accept the agreement once and upload three at a time.
- Keep the submitted recording unchanged: no normalization, conversion or waveform generation.
- Limit each file to 250 MB and 30 minutes; recommend 320 kbps without requiring it.
- Upload directly to private R2. Freeze a candidate original before format, duration and
  SHA-256 verification, then register an identical private playback copy.
- Acceptance activates the self-upload licence immediately. Successful verification
  atomically publishes the track; there is no admin approval queue.
- Retry the same admission/complete request without duplicate tracks or another daily slot.
  The daily limit is 20 new admissions. Keep the tab open for transfers.
- Existing Opus/AAC recordings remain playable. Waveforms are optional.
- Existing withdrawal removes current playback copies; originals remain unless explicitly deleted.
- A terminated self-upload agreement cannot be bypassed by accepting again.
- Track suspension/account suspension UX and a track dispute form with email notification
  are separate backlog work. Linear reconciliation is deferred at the owner's request.

See [direct upload operations](../deploy/direct-mp3-uploads.md) for rollout and verification.

## Source and operational references

- [Hosted-audio migration](../supabase/migrations/20260905090000_hosted_audio.sql)
- [Upload migration](../supabase/migrations/20260907180000_artist_audio_uploads.sql)
- [Server implementation](../apps/web/lib/hosted-audio/server.ts)
- [Upload rules](../apps/web/lib/hosted-audio/upload-rules.ts)
- [Worker](../apps/web/scripts/process-audio-uploads.mjs)
- [Web setup guide](../apps/web/README.md) for bootstrap, buckets/CORS, worker and cleanup details.

## Agreed MVP changes

- Non-exclusive artist hosting model initially; revenue sharing later.
- Onboard Gereon as first featured music artist. Fergal reports site-use permission;
  record actual identity, material and permission scope before publication.
- Admin artist/licence setup, including artists without accounts and optional user linking.
- Admin featured-artist configuration and entry routing per MVP specification.
- Track-to-visual assignment; most-popular visual fallback when absent.
- Music discovery carousels and creator/artist presentation.
- Validate upload through publication/playback/withdrawal before marking ready.

## Open

Agreement details, artist claiming, multi-artist administration, featured running order,
ranking, track/visual assignment UI and invalid-content fallbacks.
No permission for video export, redistribution or livestream use is inferred from site permission.
The old PoC exclusions of browser uploads/hosted music no longer define scope.
