# VisAmp — Hosted Music Catalogue: Technical Specification

**Status:** draft for implementation
**Scope:** server-side storage, ingest, delivery and data model for VisAmp-hosted audio tracks
**Stack:** Next.js (Vercel) · Supabase/Postgres · Cloudflare R2 + CDN

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
      │   visamp-masters   (private, IA class)  │
      │   visamp-audio     (private, standard)  │
      └──────────┬──────────────────────────────┘
                 │ custom domain: audio.visamp.io
                 │ (Cloudflare CDN + WAF)
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

Two buckets, deliberately:

- **`visamp-masters`** — the original artist-supplied files. Never served to browsers. Exists so the catalogue can be re-transcoded when codec choices change without going back to every artist. Use R2 **Infrequent Access** storage class.
- **`visamp-audio`** — derived, browser-playable renditions. Standard class. This is the only bucket bound to a public hostname.

Neither bucket has public read enabled. All access is presigned.

---

## 3. Storage layout

### Key structure

```
visamp-masters/
  {track_id}/original.{wav|flac|aiff}
  {track_id}/original.json          # ffprobe output, checksums, upload provenance

visamp-audio/
  {track_id}/{rendition_id}.opus    # Opus in Ogg
  {track_id}/{rendition_id}.m4a     # AAC-LC in MP4
  {track_id}/peaks.json             # precomputed waveform peaks
  {track_id}/art-{512|1024}.webp
```

`track_id` is the Postgres UUID primary key. `rendition_id` is a short random string regenerated on every re-transcode.

**Why `rendition_id` and not a fixed filename:** object keys become immutable. A re-transcode writes new keys and updates the DB pointer, so no CDN cache invalidation is ever required and in-flight players finish on the old file rather than mid-track glitching. Old renditions are deleted on a lifecycle rule 7 days after being unreferenced.

### Lifecycle rules
- `visamp-masters`: no expiry. Transition to IA immediately.
- `visamp-audio`: no expiry on referenced objects. Unreferenced renditions cleaned by a weekly job (see §8.4).

---

## 4. Encoding

### Renditions

Ship exactly two per track:

| Rendition | Codec | Container | Bitrate | Channels | Sample rate |
|---|---|---|---|---|---|
| `opus` | Opus | Ogg | 96 kbps VBR | stereo | 48 kHz |
| `aac` | AAC-LC | MP4 | 128 kbps | stereo | 44.1 kHz |

Opus is the default and will serve the large majority of traffic. AAC exists as the compatibility fallback — Safari's Opus support has historically been inconsistent enough that it isn't worth debugging in production. Select at playback time by capability detection, not user-agent sniffing:

```js
const canOpus = audioEl.canPlayType('audio/ogg; codecs="opus"') !== '';
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

Generate a peaks file at ingest for the scrub bar. Fixed resolution, roughly 1000 buckets across the track regardless of duration, min/max pairs as `Int8Array` normalised to ±127, serialised as JSON:

```json
{ "version": 1, "channels": 1, "buckets": 1000, "bits": 8, "data": [-42, 39, ...] }
```

Under 4 KB per track. Cache aggressively. Cheap to compute and it removes the need for the client to decode the whole file to draw a scrub bar.

---

## 5. Delivery

### 5.1 CORS — read this before writing any player code

VisAmp analyses audio through the Web Audio API. **Audio loaded cross-origin without correct CORS is tainted, and `AnalyserNode` returns silence — all zeros — with no error thrown anywhere.** The audio plays perfectly and the visualisation sits dead. This has cost other people days.

Two things must both be true:

1. The `<audio>` element sets `crossOrigin="anonymous"` **before** `src` is assigned.
2. R2 returns permissive CORS headers on the audio bucket.

R2 CORS policy for `visamp-audio`:

```json
[{
  "AllowedOrigins": [
    "https://visamp.io",
    "https://www.visamp.io",
    "https://*.visamp.io",
    "http://localhost:3000"
  ],
  "AllowedMethods": ["GET", "HEAD"],
  "AllowedHeaders": ["Range", "Content-Type"],
  "ExposeHeaders": ["Content-Length", "Content-Range", "Accept-Ranges", "Content-Type"],
  "MaxAgeSeconds": 86400
}]
```

`ExposeHeaders` must include the range headers or seeking misbehaves in some browsers.

**Add an automated test for this.** A headless-browser check that loads a known track, runs 2 seconds of playback and asserts the analyser's frequency data is non-zero. It's the one failure in this system that produces no error signal at all.

### 5.2 Custom domain and presigning

Bind `audio.visamp.io` to the `visamp-audio` bucket through Cloudflare. Bucket stays private.

Audio URLs are **S3-compatible presigned GETs** issued by Next.js, TTL **3600s**. One hour comfortably outlasts any single track and any reasonable seek-around, while making a leaked URL near-worthless.

Client flow:

```
GET /api/tracks/{id}/playback
  → 200 { track: {...}, sources: [
        { format: "opus", url: "https://audio.visamp.io/...?X-Amz-...", expiresAt },
        { format: "aac",  url: "...", expiresAt }
      ], peaksUrl: "..." }
```

Return the URL as JSON rather than 302-redirecting. The player needs metadata anyway, and a redirect makes the presign a hidden step during debugging.

**Never proxy the bytes through a Next.js route handler.** That reintroduces every bandwidth cost this design exists to avoid.

### 5.3 Range requests

Range support is mandatory — scrubbing and VJ cueing depend on it. R2 handles this natively. The only way to break it is to put something in the path that buffers, so don't.

### 5.4 Caching

Presigned URLs carry a signature in the query string, and Cloudflare's default cache key includes query strings — so naive presigning gives near-zero cache hit rate.

Fix with a Cache Rule on `audio.visamp.io` using a custom cache key that **ignores query string parameters entirely**, matching on path only. Path already contains the immutable `rendition_id`, so this is safe: one path is always exactly one byte sequence.

Set `Cache-Control: public, max-age=31536000, immutable` as object metadata at upload time.

Worth keeping in perspective: R2 has no egress fees, so cache misses cost latency, not money. Configure this properly, but don't spend a week on it.

### 5.5 What this costs

Storage is negligible: a 4-minute track at 96 kbps Opus is ~2.9 MB; both renditions plus master, artwork and peaks is roughly 45 MB per track dominated by the WAV master in IA. A 500-track catalogue is under 25 GB, which is a couple of dollars a month.

Egress from R2 is zero. The marginal cost of an additional listener-hour is zero. This is the entire reason for the architecture.

---

## 6. Data model

### 6.1 Music artists

Distinct from VisAmp user accounts. A hosted music artist may have no VisAmp login, and a VisAmp user is a *visualisation* artist. Do not overload one table.

```sql
create table music_artists (
  id            uuid primary key default gen_random_uuid(),
  slug          text not null unique,
  name          text not null,
  bio           text,
  website_url   text,
  avatar_key    text,                        -- R2 key
  claimed_by    uuid references auth.users,  -- null until/unless they sign up
  created_at    timestamptz not null default now()
);
```

`claimed_by` is the seam for the future self-serve phase. Nullable now, no other design implications.

### 6.2 Licences

A track may not go live without a licence row. Enforce it.

```sql
create type licence_status as enum ('pending', 'active', 'terminated');

create table licences (
  id                   uuid primary key default gen_random_uuid(),
  music_artist_id      uuid not null references music_artists(id),
  status               licence_status not null default 'pending',
  document_key         text,           -- signed PDF in a private bucket
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
  created_at           timestamptz not null default now()
);
```

The four `grants_*` flags exist because they are genuinely separable rights and pairing audio with generated visuals is arguably a **sync** use, not merely a streaming one. The two `warrants_*` flags record that the artist asserted they control both the master and the publishing — the single most common way small-label deals fall apart later is an uncredited co-writer.

### 6.3 Tracks

```sql
create type track_status as enum ('draft', 'live', 'withdrawn');

create table tracks (
  id                uuid primary key default gen_random_uuid(),
  slug              text not null unique,
  music_artist_id   uuid not null references music_artists(id),
  licence_id        uuid references licences(id),
  status            track_status not null default 'draft',

  title             text not null,
  album             text,
  year              int,
  isrc              text,
  bpm               numeric(6,2),
  musical_key       text,
  genre_tags        text[] not null default '{}',

  duration_ms       int not null,
  loudness_in_lufs  numeric(5,2),     -- measured pre-normalisation
  loudness_gain_db  numeric(5,2),     -- gain applied
  peaks_key         text,
  artwork_key       text,

  master_key        text,             -- visamp-masters
  master_sha256     text,

  play_count        bigint not null default 0,
  published_at      timestamptz,
  withdrawn_at      timestamptz,
  created_at        timestamptz not null default now()
);

create index on tracks (music_artist_id) where status = 'live';
```

Constraint: `status = 'live'` requires `licence_id is not null` and a licence whose status is `active`. Implement as a trigger, not application logic — this is the rule that matters most and it should be impossible to bypass from a script.

`bpm` and `musical_key` are optional but worth capturing at ingest: sets and VJ Mode will want them for beat-locked visualisation cues, and pulling them out of the master at ingest is free compared to backfilling later.

### 6.4 Renditions

```sql
create table track_renditions (
  id          uuid primary key default gen_random_uuid(),
  track_id    uuid not null references tracks(id) on delete cascade,
  format      text not null check (format in ('opus', 'aac')),
  object_key  text not null,
  bitrate_kbps int not null,
  bytes       bigint not null,
  is_current  boolean not null default true,
  created_at  timestamptz not null default now()
);

create unique index on track_renditions (track_id, format) where is_current;
```

Superseded renditions stay with `is_current = false` until the cleanup job removes both row and object.

### 6.5 Audio references — the piece sets depend on

Playlists reference visualisations, which are internal entities. **Sets reference audio, which is not.** Audio can come from four sources with radically different properties, and sets are shared between users, so this needs an explicit abstraction rather than a `track_id` column.

```sql
create type audio_kind as enum ('hosted', 'soundcloud', 'local', 'bridge', 'mic');

create table audio_refs (
  id            uuid primary key default gen_random_uuid(),
  kind          audio_kind not null,
  track_id      uuid references tracks(id),   -- kind = 'hosted'
  sc_urn        text,                         -- kind = 'soundcloud'
  local_hint    jsonb,                        -- kind = 'local': filename, duration, size
  created_at    timestamptz not null default now(),

  constraint hosted_has_track check (kind <> 'hosted' or track_id is not null),
  constraint sc_has_urn       check (kind <> 'soundcloud' or sc_urn is not null)
);
```

Capability matrix — this is the part to get in front of whoever specs sets:

| kind | Resolvable by another user | Has a timeline (duration/seek) | Can carry timed cues |
|---|---|---|---|
| `hosted` | yes | yes | yes |
| `soundcloud` | yes, subject to 15k/day cap and playability | yes | yes |
| `local` | **no** | yes | only for the owner |
| `bridge` | no | **no** | manual / beat-triggered only |
| `mic` | no | **no** | manual / beat-triggered only |

Two consequences follow, and both should be settled before sets are built:

- A set containing `local` refs is only meaningful to its author. Either block those refs at save time, or mark the set as personal-only and say so in the UI. Silently producing a set that's broken for everyone else is the worst option.
- `bridge` and `mic` have no position, no duration and no track-start event, so timed cues are impossible against them. A VJ running Ableton through the bridge is exactly the target user, so VJ Mode needs a manual/tap cueing path regardless of what sets do.

### 6.6 Withdrawal

Takedown will happen, and by then tracks will be referenced by other users' sets. `withdrawn` is a tombstone: the row and all `audio_refs` pointing at it survive, `is_current` renditions are deleted from R2, and the playback endpoint returns `410 Gone` with enough metadata for the client to render "*Track withdrawn*" in place of the entry.

Sets must degrade around a withdrawn track, never fail to load. Assume this happens mid-performance and design accordingly.

### 6.7 Plays

```sql
create table track_plays (
  id         bigserial primary key,
  track_id   uuid not null references tracks(id),
  user_id    uuid references auth.users,
  played_at  timestamptz not null default now(),
  context    text          -- 'vis' | 'set' | 'vj' | 'preview'
);
```

Count a play on the same rule already used for visualisation views: 5 seconds of actual playback, deduped per user per track per 24h. Artists will ask for numbers, and reconstructing them retrospectively is impossible.

### 6.8 RLS

- `tracks`, `music_artists`, `track_renditions`: public `select` where `status = 'live'`; all writes service-role only.
- `licences`: service-role only, no public read. Licence terms are not public information.
- `track_plays`: insert via a `security definer` RPC that applies the dedupe rule; no direct client insert.

---

## 7. API surface

| Route | Method | Auth | Purpose |
|---|---|---|---|
| `/api/tracks/{id}/playback` | GET | anon ok | Metadata + presigned rendition URLs + peaks URL. `410` if withdrawn. |
| `/api/tracks/{id}/play` | POST | anon ok | Record a play (server applies 5s/dedupe rule) |
| `/api/artists/{slug}/tracks` | GET | anon ok | Live tracks for a music artist |
| `/api/admin/tracks` | POST/PATCH | admin | Create/update track rows |
| `/api/admin/tracks/{id}/publish` | POST | admin | draft → live, validates licence |
| `/api/admin/tracks/{id}/withdraw` | POST | admin | live → withdrawn, deletes renditions |

Rate limit `/playback` per IP — it's the presign mint and the obvious target for anyone wanting to hoover the catalogue. Something like 60/min is generous for real use and useless for scraping.

---

## 8. Ingest

### 8.1 Shape

A CLI script, run locally by an admin. **Do not build a job queue, upload UI or worker pipeline for this phase.** The volume is tens of tracks onboarded by hand; a queue is weeks of work to save minutes.

```
pnpm ingest \
  --artist-slug some-artist \
  --licence <licence-uuid> \
  --input ./masters/track-01.wav \
  --title "Track Title" \
  --year 2024
```

### 8.2 Steps

1. Validate licence exists, is `active`, and grants hosting + streaming + transcoding + sync
2. `ffprobe` the input; reject anything under 44.1 kHz or lossy-sourced
3. SHA-256 the master; abort on duplicate
4. Upload master to `visamp-masters`
5. Two-pass loudnorm measurement
6. Transcode both renditions with the measured normalisation applied
7. Generate peaks JSON
8. Process artwork to 512/1024 WebP
9. Upload derived assets to `visamp-audio` with `Cache-Control: immutable`
10. Insert `tracks` + `track_renditions` rows with `status = 'draft'`
11. Print the preview URL

Publishing is a deliberate second command. Nothing goes live as a side effect of an upload.

### 8.3 Idempotency

Keyed on `master_sha256`. Re-running against the same file updates the existing track rather than creating a duplicate. Guaranteed to matter the first time a script fails at step 9.

### 8.4 Cleanup job

Weekly: delete objects in `visamp-audio` with no matching `track_renditions` row, and rendition rows with `is_current = false` older than 7 days. Log rather than delete on the first few runs.

---

## 9. Security and abuse

| Risk | Mitigation |
|---|---|
| Catalogue scraping | Rate-limit `/playback` per IP; Cloudflare rate limiting rule on `audio.visamp.io` |
| Hotlinking / becoming someone's CDN | Private bucket + 1h presigned URLs; no public read, ever |
| Presign endpoint enumeration | Track IDs are UUIDs; no sequential identifiers anywhere public |
| Licence bypass | DB trigger on `tracks.status = 'live'`, not application-layer checks |
| Master leakage | `visamp-masters` has no custom domain and no presigning path in application code |

---

## 10. Open decisions

These need answers before or during implementation; none block starting.

1. **Local refs in shared sets** — block at save, or allow and mark the set personal-only?
2. **Cue model for timeline-less sources** — does VJ Mode ship manual/tap cueing in v1, or do sets require a timeline-bearing source?
3. **Artwork fallback** — reuse the artist avatar, or generate something from the visualisation engine? The latter is more on-brand and free.
4. **Explicit-content flag** — trivial now, awkward retrofitted, and relevant if VisAmp is ever embedded somewhere public-facing.
5. **Per-track download permission** — some artists will actively want their tracks downloadable. A boolean on `tracks` costs nothing to add now.

---

## Appendix: implementation order

1. Schema migration (§6) including the licence trigger
2. R2 buckets, CORS config, custom domain, cache rule
3. Ingest CLI (§8) — validate end to end with one real track
4. `/api/tracks/{id}/playback` + presigning
5. Player integration, including the analyser CORS regression test (§5.1)
6. Admin publish/withdraw routes
7. Play counting
8. Cleanup job

Steps 1–5 are the critical path to a track playing in a visualisation. Everything after that is operational hardening and can follow.
