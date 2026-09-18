# Artist claims and disputes

VIS-130 replaces the temporary one-artist-per-user restriction from VIS-83.
An account can claim multiple artist names and select an owned artist on `/upload`.
A queued upload is pinned to its artist when first attempted, including retries.

Names are globally unique after trimming/collapsing whitespace and lowercasing.
The database unique index is authoritative. Concurrent claims are serialized by
normalized name; repeating a claim owned by the same account returns that artist.
Different names producing the same URL slug receive numeric slug suffixes.

Full artist profiles are public immediately, even without published music.
Only playable tracks appear on profiles; the artist directory continues to list
artists with playable music. Creator links require public visualisations.

A conflicting claim returns HTTP 409 with a safe name and slug, and the upload
form links to that artist. Every artist profile links to `/dispute`. Initial
review is manual via dispute@visamp.io: request the artist URL/name, contact and
relationship, explanation, requested outcome, and supporting links. Email does
not automatically transfer a claim or remove music. Stronger verification is
deferred until needed.

## Deployment

Apply `supabase/migrations/20260918030000_multiple_music_artists.sql` before using
the new claim flow. The migration refuses pre-existing normalized duplicates;
it never silently merges or renames artists. A read-only preflight on 2026-09-18
found one hosted artist and no duplicates. Recheck if the data has since changed:

```sql
select lower(btrim(regexp_replace(name, '[[:space:]]+', ' ', 'g'))) as name_key,
       count(*)
from public.music_artists
group by 1
having count(*) > 1;
```

Run `supabase/tests/artist_claiming.sql` against a local migrated database.
It rolls back fixtures and checks uniqueness, multiple ownership, idempotency,
slug collisions, safe conflict details, and RPC permissions.
