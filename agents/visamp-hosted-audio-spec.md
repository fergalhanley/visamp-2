# VisAmp — Hosted Music Catalogue: Technical Specification

**Status:** draft for implementation
**Scope:** server-side storage, ingest, delivery and data model for VisAmp-hosted audio tracks
**Stack:** Next.js (Vercel) · Supabase/Postgres · Cloudflare R2 (CDN deferred)

---

## 1. Scope

### In scope

- Storing, transcoding and delivering audio tracks that VisAmp hosts under direct artist licence
- A track identity model that playlists, sets and VJ Mode can reference durably
- Admin-operated ingest (VisAmp staff onboard artists; artists do not self-serve yet)
- Withdrawal / takedown as a first-class operation

### Out of scope (deferred, but do not design against)

- Artist self-serve upload portal — later phase, schema should not block it
- Payment, royalty accounting or streaming revenue share
- Audio search across the catalogue
- Replacing the SoundCloud integration (this runs alongside it)

### Non-negotiable constraints

1. **Audio bytes must never be served through Vercel.** All audio egress goes direct from R2 via Cloudflare. Vercel serves JSON only.
2. **SoundCloud audio must never be cached, proxied or re-hosted.** That is a Terms of Use breach. This pipeline is exclusively for tracks VisAmp holds a signed licence for.
3. **All audio responses must carry correct CORS headers.** See §5.1 — this is the single most likely thing to silently break the product.

---

## 2. Architecture overview

```
                 ┌──────────────────────┐
  Admin ────────▶│  Ingest CLI (local)  │  ffmpeg transcode + analysis
                 └──────────┬───────────┘
                            │ S3 API (write)
                            ▼
      ┌─────────────────────────────────────────┐
      │  Cloudflare R2                          │
      │   visamp-masters    (private, IA class) │
      │   media-visamp-io   (private, standard) │
      └──────────┬──────────────────────────────┘
                 │ S3 API presigned GET
                 │ <bucket>.<account>.r2.cloudflarestorage.com
                 ▼
   Browser ◀── presigned GET (range requests) ──┘
      ▲
      │ JSON: track metadata + presigned URL
      │
 ┌────┴──────────────────┐        ┌──────────────────┐
 │  Next.js (Vercel)     │───────▶│  Supabase / PG   │
 │  /api/tracks/*        │        │  catalogue + RLS │
 └───────────────────────┘        └──────────────────┘
```

Two R2 buckets, deliberately:

- **`visamp-masters`** — the original artist-supplied files. Never served to browsers. Exists so the catalogue can be re-transcoded when codec choices change without going back to every artist. Use R2 **Infrequent Access** storage class.
- **`media-visamp-io`** — derived, browser-playable renditions, waveform data and artwork. Standard class. This is the existing R2 bucket.

Neither bucket has public read or a custom domain enabled in the first release. Browser access to `media-visamp-io` uses time-limited S3-compatible presigned GET URLs on R2's API hostname. `visamp-masters` has no presigning path in application code.

Signed licence documents live in a separate private Supabase Storage bucket named **`music-licences`**. They do not belong beside either public renditions or source masters.

### Deferred CDN architecture

If traffic justifies it, bind `audio.visamp.io` to `media-visamp-io`, replace S3 presigning with path-bound timed-HMAC URLs, validate them in Cloudflare WAF before cache lookup, and configure a cache key that ignores only the signature parameters. This requires a suitable Cloudflare zone plan and is deliberately not part of the first implementation.

---

## 3. Storage layout

### Key structure

```
visamp-masters/
  {track_id}/original.{wav|flac|aiff}
  {track_id}/original.json          # ffprobe output, checksums, upload provenance

media-visamp-io/
  hosted-audio/{track_id}/{rendition_id}.opus    # Opus in Ogg
  hosted-audio/{track_id}/{rendition_id}.m4a     # AAC-LC in MP4
  hosted-audio/{track_id}/peaks-{asset_id}.json  # waveform peaks
  hosted-audio/{track_id}/art-{512|1024}-{asset_id}.webp
```

`track_id` is the Postgres UUID primary key. `rendition_id` and `asset_id` are short random strings regenerated whenever their bytes change. The `hosted-audio/` prefix isolates reconciliation from unrelated objects already held in `media-visamp-io`.

**Why versioned filenames:** object keys become immutable. A re-transcode or artwork/peaks rebuild writes new keys and updates the DB pointer, so no client cache invalidation is required and in-flight players finish on the old file rather than mid-track glitching. A database-aware cleanup job deletes unreferenced derived objects after a grace period; an R2 lifecycle rule cannot know which objects the database references.

### Lifecycle rules

- `visamp-masters`: upload directly as `STANDARD_IA`; no automatic expiry. R2 IA has a 30-day minimum storage duration.
- `media-visamp-io`: no expiry on referenced objects. Unreferenced derived objects are cleaned by the database-aware job in §8.4.
- Incomplete multipart uploads: expire after 7 days.

---

## 4. Encoding

### Renditions

Ship exactly two per track:

| Rendition | Codec  | Container | Bitrate     | Channels | Sample rate |
| --------- | ------ | --------- | ----------- | -------- | ----------- |
| `opus`    | Opus   | Ogg       | 96 kbps VBR | stereo   | 48 kHz      |
| `aac`     | AAC-LC | MP4       | 128 kbps    | stereo   | 44.1 kHz    |

Opus is the default and will serve the large majority of traffic. AAC exists as the compatibility fallback — Safari's Opus support has historically been inconsistent enough that it isn't worth debugging in production. Select at playback time by capability detection, not user-agent sniffing:

```js
const canOpus = audioEl.canPlayType('audio/ogg; codecs="opus"') !== "";
```

**Do not add a higher-bitrate tier.** This is accompaniment to a visualiser, not an audiophile listening product, and bitrate is the one lever that multiplies egress linearly. If artists push back, that's a conversation, not a config change.

### MP4 requirements

The AAC rendition **must** be faststart (moov atom at the head), or the browser downloads the whole file before playing:

```
ffmpeg -i in.wav -c:a aac -b:a 128k -movflags +faststart out.m4a
```

### Loudness normalisation

Normalise every track to **EBU R128, -14 LUFS integrated, -1 dBTP ceiling**, two-pass:

```
# pass 1 — measure
ffmpeg -i in.wav -af loudnorm=I=-14:TP=-1:LRA=11:print_format=json -f null -

# pass 2 — apply, using measured values from pass 1
ffmpeg -i in.wav -af loudnorm=I=-14:TP=-1:LRA=11:measured_I=...:measured_TP=...:measured_LRA=...:measured_thresh=...:offset=...:linear=true \
  -c:a libopus -b:a 96k out.opus
```

Two reasons this is required rather than nice-to-have. First, VJ Mode plays tracks back to back through a PA — an unnormalised catalogue means the operator is riding a gain fader all night. Second, visualisations are amplitude-reactive, so inconsistent loudness means the same visualisation behaves differently per track and looks broken.

Store the measured pre-normalisation LUFS and the applied gain on the track row. If normalisation ever needs revisiting, that data is the difference between a re-run and a re-ingest.

### Waveform peaks

Generate a peaks file at ingest for the scrub bar. Fixed resolution, 1000 buckets across the track regardless of duration, with mono min/max pairs as signed 8-bit values. Store the 2000-byte array as base64 inside JSON:

```json
{
  "version": 1,
  "channels": 1,
  "buckets": 1000,
  "bits": 8,
  "encoding": "base64-int8",
  "data": "1inT..."
}
```

Roughly 2.8 KB per track including JSON overhead. Cheap to compute and it removes the need for the client to decode the whole file to draw a scrub bar.

---

## 5. Delivery

### 5.1 CORS — read this before writing any player code

VisAmp analyses audio through the Web Audio API. **Audio loaded cross-origin without correct CORS is tainted, and `AnalyserNode` returns silence — all zeros — with no error thrown anywhere.** The audio plays perfectly and the visualisation sits dead. This has cost other people days.

Two things must both be true:

1. The `<audio>` element sets `crossOrigin="anonymous"` **before** `src` is assigned.
2. R2 returns permissive CORS headers on the audio bucket.

R2 CORS policy for `media-visamp-io`:

```json
[
  {
    "AllowedOrigins": [
      "https://visamp.io",
      "https://www.visamp.io",
      "http://localhost:3000"
    ],
    "AllowedMethods": ["GET", "HEAD"],
    "AllowedHeaders": ["Range", "Content-Type"],
    "ExposeHeaders": [
      "Content-Length",
      "Content-Range",
      "Accept-Ranges",
      "Content-Type"
    ],
    "MaxAgeSeconds": 86400
  }
]
```

R2 origin matching is exact. Add any future preview or staging origins explicitly; do not use a wildcard subdomain as an origin value. Exposing the range headers lets application diagnostics and integration tests inspect them; actual seeking depends on R2 returning correct range responses, not on JavaScript being allowed to read those headers.

**Add automated tests for this.** First, an HTTP test sends an `Origin` header and a byte range and asserts CORS headers plus a `206`, `Content-Range` and `Accept-Ranges`. Second, a headless-browser check loads a known track, runs 2 seconds of playback and asserts the analyser's frequency data is non-zero. This is the one failure in the system that otherwise produces no useful application error.

### 5.2 Private R2 presigning

Keep `media-visamp-io` private. S3-compatible presigned GET URLs are issued by Next.js and use R2's `<bucket>.<account>.r2.cloudflarestorage.com` API hostname. R2 S3 presigned URLs do not work on custom domains.

URLs have a TTL of **3600s**. Treat them as bearer credentials. One hour outlasts a normal uninterrupted track, but not necessarily a paused or cued VJ session, so the player must use `expiresAt` as described below.

Client flow:

```
GET /api/tracks/{id}/playback
  → 200 { track: {...}, sources: [
        { format: "opus", url: "https://media-visamp-io.<account>.r2.cloudflarestorage.com/...?X-Amz-...", expiresAt },
        { format: "aac",  url: "...", expiresAt }
      ], peaks: { url: "...", expiresAt }, artwork: { url: "...", expiresAt } }
```

The playback response must carry `Cache-Control: private, no-store`; a cached JSON response becomes a cached expired credential. Return URLs as JSON rather than 302-redirecting because the player needs metadata and expiry information anyway.

The player must:

1. Set `crossOrigin = "anonymous"` before assigning `src`.
2. Choose Opus or AAC with capability detection.
3. Resolve a replacement URL shortly before `expiresAt` if the media is still loaded.
4. On an opaque media network failure, resolve once more and resume from the previous position. Do not enter an unbounded retry loop.

**Never proxy the bytes through a Next.js route handler.** That reintroduces every bandwidth cost this design exists to avoid.

### 5.3 Range requests

Range support is mandatory — scrubbing and VJ cueing depend on it. R2 handles this natively. Presign `GET`; do not insert a buffering proxy. Verify range behaviour in the delivery integration test rather than assuming it from successful full-object playback.

### 5.4 Caching

There is no Cloudflare CDN layer in the first release. R2's S3 API path is not the custom-domain cache path.

Set derived object metadata explicitly at upload:

| Asset   | `Content-Type`     | `Cache-Control`        |
| ------- | ------------------ | ---------------------- |
| Opus    | `audio/ogg`        | `private, max-age=300` |
| AAC     | `audio/mp4`        | `private, max-age=300` |
| Peaks   | `application/json` | `private, max-age=300` |
| Artwork | `image/webp`       | `private, max-age=300` |

The short private cache avoids turning a one-hour signed URL into a year-long browser cache credential. Immutable versioned paths remain useful if CDN delivery is added later.

### 5.5 What this costs

Storage is small: a 4-minute track at 96 kbps Opus is ~2.9 MB; both renditions plus master, artwork and peaks are roughly 45 MB per track, dominated by the master. A 500-track catalogue is under 25 GB.

R2 does not charge internet egress, but storage, Class A writes and Class B reads remain billable. Listener cost is therefore very low rather than literally zero. If request volume makes read cost or latency material, add the deferred custom-domain CDN design.

---

## 6. Data model

### 6.1 Music artists

Distinct from VisAmp user accounts. A hosted music artist may have no VisAmp login, and a VisAmp user is a _visualisation_ artist. Do not overload one table.

```sql
create table public.music_artists (
  id            uuid primary key default gen_random_uuid(),
  slug          text not null unique,
  name          text not null,
  bio           text,
  website_url   text,
  avatar_key    text,                        -- R2 key
  claimed_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),

  constraint music_artists_name_not_blank check (btrim(name) <> ''),
  constraint music_artists_slug_format check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$')
);
```

`claimed_by` is the seam for the future self-serve phase. Nullable now, no other design implications.

### 6.2 Licences

A track may not go live without a licence row. Enforce it.

```sql
create type public.licence_status as enum ('pending', 'active', 'terminated');

create table public.licences (
  id                   uuid primary key default gen_random_uuid(),
  music_artist_id      uuid not null references public.music_artists(id),
  status               public.licence_status not null default 'pending',
  document_key         text,           -- private Supabase `music-licences` bucket
  signed_at            timestamptz,
  effective_from       date,
  effective_until      date,           -- null = perpetual until terminated
  territory            text not null default 'worldwide',
  grants_hosting       boolean not null default false,
  grants_streaming     boolean not null default false,
  grants_transcoding   boolean not null default false,
  grants_sync          boolean not null default false,
  warrants_master      boolean not null default false,
  warrants_publishing  boolean not null default false,
  termination_notice_days int,
  notes                text,
  terminated_at        timestamptz,
  created_at           timestamptz not null default now(),

  constraint licences_date_order check (
    effective_until is null or effective_from is null or effective_until >= effective_from
  ),
  constraint licences_notice_nonnegative check (
    termination_notice_days is null or termination_notice_days >= 0
  )
);
```

The four `grants_*` flags exist because they are genuinely separable rights and pairing audio with generated visuals may be a **sync** use, not merely a streaming one. The two `warrants_*` flags record that the artist asserted they control both the master and the publishing. The licence template and retention obligations still require review by whoever owns VisAmp's legal process; the database records the decision but does not make it.

### 6.3 Tracks

```sql
create type public.track_status as enum ('ingesting', 'draft', 'live', 'withdrawn');

create table public.tracks (
  id                uuid primary key default gen_random_uuid(),
  slug              text not null unique,
  music_artist_id   uuid not null references public.music_artists(id),
  licence_id        uuid references public.licences(id),
  status            public.track_status not null default 'ingesting',

  title             text not null,
  album             text,
  year              int,
  isrc              text,
  bpm               numeric(6,2),
  musical_key       text,
  genre_tags        text[] not null default '{}',
  is_explicit       boolean not null default false,
  download_allowed  boolean not null default false,

  duration_ms       int not null,
  loudness_in_lufs  numeric(5,2),     -- measured pre-normalisation
  loudness_gain_db  numeric(5,2),     -- gain applied
  peaks_key         text,
  artwork_512_key   text,
  artwork_1024_key  text,

  master_key        text,             -- visamp-masters
  master_sha256     text,

  play_count        bigint not null default 0,
  published_at      timestamptz,
  withdrawn_at      timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint tracks_title_not_blank check (btrim(title) <> ''),
  constraint tracks_duration_positive check (duration_ms > 0),
  constraint tracks_bpm_positive check (bpm is null or bpm > 0),
  constraint tracks_year_plausible check (year is null or year between 1900 and 2200),
  constraint tracks_play_count_nonnegative check (play_count >= 0),
  constraint tracks_master_sha256_format check (
    master_sha256 is null or master_sha256 ~ '^[0-9a-f]{64}$'
  ),
  constraint tracks_master_sha256_unique unique (master_sha256),
  constraint tracks_master_key_unique unique (master_key)
);

create index tracks_live_artist_idx
  on public.tracks (music_artist_id, published_at desc)
  where status = 'live';
```

Publishing is enforced by a trigger, not only application logic. A transition to `live` requires a licence that:

- belongs to the same `music_artist_id` as the track;
- has `status = 'active'`, `signed_at` and `effective_from`;
- is currently within its effective date range; and
- grants hosting, streaming, transcoding and sync.

The trigger also owns `published_at` and `withdrawn_at` transition timestamps. This check is necessary but not sufficient: a trigger cannot react when the clock passes `effective_until`, so catalogue and playback queries must repeat the effective-status check at request time. An expired or terminated licence must stop new playback URLs even if the track row still says `live`.

`bpm` and `musical_key` are optional but worth capturing at ingest: sets and VJ Mode will want them for beat-locked visualisation cues, and pulling them out of the master at ingest is free compared to backfilling later.

### 6.4 Renditions

```sql
create table public.track_renditions (
  id          uuid primary key default gen_random_uuid(),
  track_id    uuid not null references public.tracks(id) on delete cascade,
  format      text not null check (format in ('opus', 'aac')),
  object_key  text not null unique,
  bitrate_kbps int not null check (bitrate_kbps > 0),
  bytes       bigint not null check (bytes > 0),
  is_current  boolean not null default true,
  created_at  timestamptz not null default now()
);

create unique index track_renditions_current_format_idx
  on public.track_renditions (track_id, format)
  where is_current;
```

Upload new objects first, then switch the old and new `is_current` rows in one database transaction. Superseded renditions stay with `is_current = false` until the cleanup job removes the object and then the row.

### 6.5 Audio references — deferred until sets

Playlists reference visualisations, which are internal entities. **Sets reference audio, which is not.** Audio can come from five sources with radically different properties, and sets are shared between users, so this will need an explicit abstraction rather than a `track_id` column.

Do **not** create a free-standing `audio_refs` table in the hosted-audio migration. It has no ownership or visibility boundary until the set/set-item model exists. When sets are implemented, the audio reference should belong to a set item and inherit that set's ownership and sharing policy. Its database constraint must require exactly the payload for its kind and reject irrelevant payload columns—for example, a hosted ref has a `track_id` and no SoundCloud or local fields.

Capability matrix — this is the part to get in front of whoever specs sets:

| kind         | Resolvable by another user                  | Has a timeline (duration/seek) | Can carry timed cues         |
| ------------ | ------------------------------------------- | ------------------------------ | ---------------------------- |
| `hosted`     | yes                                         | yes                            | yes                          |
| `soundcloud` | yes, subject to 15k/day cap and playability | yes                            | yes                          |
| `local`      | **no**                                      | yes                            | only for the owner           |
| `bridge`     | no                                          | **no**                         | manual / beat-triggered only |
| `mic`        | no                                          | **no**                         | manual / beat-triggered only |

Two consequences follow, and both should be settled before the set migration:

- A set containing `local` refs is only meaningful to its author. Either block those refs at save time, or mark the set as personal-only and say so in the UI. Silently producing a set that's broken for everyone else is the worst option.
- `bridge` and `mic` have no position, no duration and no track-start event, so timed cues are impossible against them. A VJ running Ableton through the bridge is exactly the target user, so VJ Mode needs a manual/tap cueing path regardless of what sets do.

### 6.6 Withdrawal

Takedown will happen, and by then tracks may be referenced by other users' sets. `withdrawn` is a tombstone: the track row and future set references survive, and the playback endpoint returns `410 Gone` with enough safe metadata for the client to render "_Track withdrawn_" in place of the entry.

Withdrawal is an idempotent operation:

1. In one database transaction, mark the track withdrawn and create deletion-outbox rows for every derived object. This immediately stops new playback URLs.
2. Process the outbox by deleting each object from `media-visamp-io`, then marking that deletion complete. A partial failure is retried by object key; it must not put the track live again.
3. Delete or retain the master according to the signed licence's termination/retention terms. VisAmp's licence template must explicitly settle this before the first artist is onboarded.

The launch architecture has no CDN cache to purge. If the deferred custom-domain CDN is enabled, cache purge for every derived path becomes an additional mandatory outbox step because deleting an R2 object alone does not revoke an edge-cached copy.

```sql
create table public.track_asset_deletions (
  id           bigserial primary key,
  track_id     uuid not null references public.tracks(id),
  bucket       text not null check (bucket in ('media-visamp-io', 'visamp-masters')),
  object_key   text not null,
  reason       text not null check (reason in ('withdrawal', 'superseded', 'orphan')),
  attempts     int not null default 0 check (attempts >= 0),
  last_error   text,
  completed_at timestamptz,
  created_at   timestamptz not null default now(),

  constraint track_asset_deletions_object_unique unique (bucket, object_key)
);
```

Sets must degrade around a withdrawn track, never fail to load. Assume this happens mid-performance and design accordingly.

### 6.7 Plays

```sql
create table public.track_plays (
  id         bigserial primary key,
  track_id   uuid not null references public.tracks(id),
  user_id    uuid references auth.users(id) on delete set null,
  listener_hash text not null,
  played_at  timestamptz not null default now(),
  context    text not null check (context in ('vis', 'set', 'vj', 'preview'))
);

create index track_plays_dedupe_idx
  on public.track_plays (track_id, listener_hash, played_at desc);
```

The client posts only after 5 seconds of actual playback. The server derives `listener_hash` from either the authenticated user id or a first-party random listener cookie using a server-side HMAC key; raw IP addresses are not stored. The write function takes a transaction-level advisory lock for the track/listener pair, rejects another play within the previous 24 hours, inserts the event and increments `tracks.play_count` in the same transaction. A replaceable anonymous cookie makes this useful deduplication, not fraud prevention.

This is intentionally different from the current visualisation view counter, which records immediately and does not dedupe by viewer.

### 6.8 RLS

- Enable RLS on every catalogue table and revoke all direct `anon`/`authenticated` table privileges for the first release. Public catalogue reads go through the JSON API, which returns an explicit safe projection and applies current licence validity.
- `licences`, `track_renditions`, master keys, hashes, deletion outbox rows and play rows are service-role-only. Licence terms and storage internals are not public information.
- Keep the Supabase service-role key in server-only modules and the local ingest environment. It must never use a `NEXT_PUBLIC_` variable or enter a client bundle.
- Create a service-only `app_admins(user_id uuid primary key references auth.users)` table. Admin routes first authenticate the request as a Supabase user, then use the service client to check membership. Possession of an ordinary account is not admin authorisation.
- `/play` performs its server-side write through a locked database function; there is no direct client insert grant and no publicly executable database RPC.

```sql
create table public.app_admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
```

Bootstrap the first row manually through a trusted SQL/admin environment. There is no public route for granting admin membership.

---

## 7. API surface

| Route                             | Method | Auth       | Purpose                                                                                                            |
| --------------------------------- | ------ | ---------- | ------------------------------------------------------------------------------------------------------------------ |
| `/api/tracks`                     | GET    | anon ok    | Safe projection of every currently licensed live track for the VisAmp catalogue                                    |
| `/api/tracks/{id}/playback`       | GET    | anon ok    | Safe metadata + fresh presigned rendition, peaks and artwork URLs. Always `private, no-store`; `410` if withdrawn. |
| `/api/tracks/{id}/play`           | POST   | anon ok    | Record a play after the client reaches 5 seconds; server applies identity/dedupe rules.                            |
| `/api/artists/{slug}/tracks`      | GET    | anon ok    | Live tracks for a music artist                                                                                     |
| `/api/admin/tracks`               | POST   | admin      | Create a track row when not using the ingest CLI                                                                   |
| `/api/admin/tracks/{id}`          | PATCH  | admin      | Update safe track metadata                                                                                         |
| `/api/admin/tracks/{id}/playback` | GET    | admin      | Preview an ingesting or draft track with fresh presigned URLs                                                      |
| `/api/admin/tracks/{id}/publish`  | POST   | admin      | draft → live, validates licence                                                                                    |
| `/api/admin/tracks/{id}/withdraw` | POST   | admin      | live → withdrawn and enqueue asset deletion                                                                        |
| `/api/admin/audio-deletions`      | POST   | admin/cron | Process pending withdrawal and superseded-asset deletions                                                          |

For a missing, draft, ingesting or currently unlicensed track, the public endpoint returns `404` without revealing which condition applied. A withdrawn track returns `410` because durable set references need to distinguish that tombstone.

Rate limit `/playback` per IP as a basic abuse control—something like 60/min is generous for normal use. It is not a complete anti-scraping measure because public artist listings necessarily reveal playable track IDs. Do not add application-level response caching to a route that returns expiring credentials.

---

## 8. Ingest

### 8.1 Shape

A CLI script, run locally by an admin. **Do not build a job queue, upload UI or worker pipeline for this phase.** The volume is tens of tracks onboarded by hand; a queue is weeks of work to save minutes.

```
pnpm ingest \
  --artist-slug some-artist \
  --licence <licence-uuid> \
  --input ./masters/track-01.wav \
  --artwork ./art/track-01.png \
  --title "Track Title" \
  --year 2024
```

### 8.2 Steps

1. Validate the licence belongs to the selected artist, is currently active, and grants hosting + streaming + transcoding + sync.
2. `ffprobe` the input; reject sample rates below 44.1 kHz and known lossy input formats. A PCM file's earlier lossy lineage cannot be determined reliably, so do not claim otherwise.
3. SHA-256 the master and query the unique checksum. Abort with the existing track id on a duplicate unless this is an explicit `--resume <track-id>` operation.
4. Generate the track UUID and insert an `ingesting` row before uploading. This gives every object and partial failure a durable owner.
5. Upload the master to `visamp-masters` as `STANDARD_IA`, along with the probe/checksum/provenance document.
6. Run the two-pass loudnorm measurement once.
7. Transcode both renditions with the measured normalisation applied, including AAC `+faststart`, then verify duration and output loudness.
8. Generate the base64 peaks JSON.
9. Process optional artwork to 512/1024 WebP. Playback falls back to artist avatar, then the product's static default artwork.
10. Upload derived assets to `media-visamp-io` under versioned keys with the exact content types and cache metadata from §5.4.
11. In one database transaction, insert the rendition rows, update asset pointers and change `ingesting → draft`.
12. Remove local temporary files and print the admin preview URL.

Publishing is a deliberate second command. Nothing goes live as a side effect of an upload.

Use a unique temporary directory per run and pin/log the ffmpeg version and encoding arguments in the provenance document. Interrupt handling removes local temporary files but leaves the database row and uploaded objects available to an explicit resume.

### 8.3 Idempotency

`master_sha256` is unique, but matching bytes are not permission to overwrite arbitrary metadata or another artist's track. A normal duplicate aborts and prints the existing id. `--resume <track-id>` is allowed only when the checksum and artist match, and fills or replaces assets for that exact `ingesting` or `draft` track using new versioned keys.

### 8.4 Cleanup job

Run withdrawal outbox work promptly. Separately, a weekly reconciliation:

- reports objects in `media-visamp-io` with no current database pointer and older than 7 days;
- deletes superseded renditions and assets older than 7 days, object first and row second;
- never deletes a current pointer or a recent upload; and
- supports `--dry-run`, which is mandatory for the first production runs.

Do not apply orphan cleanup to masters. An `ingesting` row is reviewed or resumed manually; master deletion follows the licence retention rule, never a generic age rule.

After committing a withdrawal, the admin route immediately attempts its queued deletions. A cron-protected route processes any incomplete outbox rows so a timeout or transient R2 failure cannot strand licensed audio. The processor handles metadata and delete calls only; it never reads or proxies audio bytes.

---

## 9. Security and abuse

| Risk                                | Mitigation                                                                                                                                              |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Catalogue scraping                  | Rate-limit discovery and `/playback`; monitor volume. Public catalogues cannot make scraping impossible.                                                |
| Hotlinking / becoming someone's CDN | Private bucket + path-bound 1h S3 presigned URLs; no public read or custom domain in v1.                                                                |
| Playback endpoint guessing          | UUIDs prevent sequential guessing, but author/artist listings intentionally expose live IDs; authorization comes from track/licence state, not secrecy. |
| Licence bypass                      | Publish trigger plus licence-validity checks on every catalogue/playback request.                                                                       |
| Master leakage                      | `visamp-masters` has no custom domain and no presigning path in application code                                                                        |
| Admin escalation                    | Authenticated user plus service-only `app_admins` check before any service-role mutation.                                                               |
| Stale signed URLs                   | Playback JSON is `private, no-store`; player refreshes before expiry and retries resolution at most once on media failure.                              |

---

## 10. Open decisions

These do not block the hosted-track critical path. The first two are deliberately deferred with the set schema.

1. **Local refs in shared sets** — block at save, or allow and mark the set personal-only?
2. **Cue model for timeline-less sources** — does VJ Mode ship manual/tap cueing in v1, or do sets require a timeline-bearing source?
3. **Master retention on termination** — settle this in the licence template before the first artist is onboarded. Code supports either retention or deletion but must follow the signed agreement.
4. **Future CDN threshold** — define the traffic/latency level that justifies `audio.visamp.io`, timed-HMAC WAF validation, cache rules and purge automation.

Artwork fallback is now deterministic: track artwork → artist avatar → static product artwork. `is_explicit` and `download_allowed` are present in the initial schema, both defaulting to false. A public download endpoint remains deferred until the product exposes that feature.

---

## Appendix: implementation order

1. Schema migration for the hosted catalogue, admin membership, licence trigger and deletion outbox; exclude deferred `audio_refs`.
2. Configure private `visamp-masters`, private `media-visamp-io`, private Supabase `music-licences`, and the exact R2 CORS policy. Do not add a custom domain or CDN rule.
3. Ingest CLI (§8) — validate end to end with one owned/licensed real track.
4. Public/admin playback endpoints with S3 presigning and `private, no-store`.
5. Progressive hosted-audio player integration, proactive URL renewal, range/CORS HTTP test and analyser browser regression test (§5.1).
6. Admin publish/withdraw routes plus functioning deletion-outbox processing.
7. Play counting and listener-cookie dedupe.
8. Weekly reconciliation/cleanup job, initially dry-run only.

Steps 1–5 are the critical path to a track playing in a visualisation. Step 6 is required before the first public catalogue launch because takedown must work from day one. Play analytics and weekly reconciliation may follow after playback is proven.
