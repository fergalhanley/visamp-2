# Hosted music: implementation baseline and MVP decisions

Replaces the PoC technical proposal. Reviewed at f224eeebd0fa003cda6c5fbd65e01eb3ac3f9a7e.
Product authority: [MVP specification](../dev/mvp.md). Work: [ticket drafts](../dev/mvp-backlog.md).

## Implemented in code; user validation pending

- Supabase stores music artists, licences, tracks, renditions, upload and operational state.
- Music artist records can exist without accounts; optional claimed_by links an auth user.
- Private R2 storage holds masters and derived media; browser playback uses presigned URLs.
  Keep this private delivery model unless a separately reviewed task changes it.
- Artist upload checks account/artist eligibility and licence, uploads directly to storage,
  and queues processing. Worker ingests/transcodes and leaves tracks in draft.
- Admin can inspect uploads/tracks, preview, edit metadata, publish and withdraw.
- Artist/permission setup still uses trusted database administration; onboarding UI is pending.
- Upload processing is separate from web requests and must be scheduled in deployment.
- Current upload limits are 250 MB, WAV/FLAC/AIFF, at most 30 minutes and at least 44.1 kHz.
  Verify these against upload-rules and worker code before changing them.
- Existing implementation includes licence checks, restricted storage, play counting,
  processing failure handling and cleanup. Verify these in stage; do not infer production readiness.

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
