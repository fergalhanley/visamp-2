# Player music library and artist management

VIS-131 expands desktop panels to one third of the viewport (minimum 200px).
Small/touch devices retain full-width bottom sheets. Panels overlay the canvas.

The VisAmp audio source has Tracks, Artists, Favourites and Playlists tabs.
Search runs on the server across track title, artist name and album, before
pagination and after live-track/licence checks. Pages contain 40 tracks, with
stable publication/id ordering. The browser loads additional pages on scroll;
a Load more button remains available. An artist or playlist selects a clearable
Tracks filter. Track artist links open the public artist profile.

Browsing does not replace playback. Selecting a track establishes a queue from
that filter. When playback reaches the last loaded track it fetches the next
page from the original filter; a later browse filter does not change this queue.
Stale requests cannot replace a newer track selection.

Favourites and music playlists belong to the signed-in account and persist in
Supabase. Music playlists use separate tables from visual playlists. Collection
APIs derive identity from the session and verify ownership on every request;
these tables and the service-only catalogue RPC have no browser grants. Limits
are 200 music playlists per account and 1000 tracks per playlist. Deleted or
unlicensed tracks never appear in public, favourite or playlist results.

The visual panel's Playlists tab uses existing private visual playlists. Selecting
a visual sets the playlist as its next/previous context. Inaccessible or deleted
visualisations are omitted through existing RLS.

## Manage Artists

`/manage-artists` is linked from the account menu, upload page and audio library.
Owners can add/select artists, edit names, bios and typed website/social links, and upload an
artist image. Names retain the global normalized uniqueness constraint; renaming
does not change the artist's URL. Owners can edit live/draft track titles, albums
and artwork. Withdrawn/unfinished tracks are listed but are not editable here.
Artist Profile and Tracks & Artwork share a tabbed panel, with tracks in a compact
table and editing in a dialog. The old `/my-artists` page redirects permanently.
See [artist profile links](artist-profile-links.md) for link validation and migration.
No licence/publication/ownership fields can be changed through these endpoints.

Artwork accepts JPEG, PNG or WebP up to 4 MiB and 25 megapixels. The server decodes,
rotates and resizes to at most 1024px, strips metadata, and writes WebP to a unique
R2 key. It authenticates ownership before accepting the image. Public artwork
reads observe the same live/licence gate as playback; owners may view their own
draft artwork. Track artwork falls back to the artist image, then the VisAmp mark.
Previous image objects are retained; replacing an image never deletes a shared
or concurrently used object. Existing general storage cleanup remains separate.

## Rollout and checks

Apply only `supabase/migrations/20260918050000_music_library.sql` to the database
used by the web app. It is additive; it does not change existing artist, track,
licence or visual playlist records. Older manually applied migrations are not
fully represented in hosted migration history, so do not bulk-push them.

`supabase/tests/music_library.sql` checks pagination, search, private collection
isolation and licence gating in a rollback-only local transaction. Web tests
cover ownership, mutation origin checks, image validation, stale page races,
playback continuation and artist/playlist panel navigation.

## Player and upload follow-up (VIS-132)

The default visualisation transition mode is Per track. Music artist profile links
open in a separate tab to preserve playback. Favourites change immediately and
restore their previous state with an error if the save fails. Playlist labels count
saved memberships in SQL (including members temporarily unavailable due to licensing).
Explicit track removal clears its favourites and playlist memberships.

Upload rows support an optional album override and JPEG/PNG/WebP artwork up to 4 MB.
After MP3 finalisation, the existing owner-scoped detail and image endpoints save
these fields. A failed detail/image save leaves the completed upload retryable;
Retry reuses its track and never transfers the MP3 again. A track may be playable
before its optional artwork finishes saving.

Manage Artists offers confirmed removal and a re-upload link preselecting the artist.
Removal uses a service-only owner-checking RPC, permanently withdraws the old track,
and queues public assets for deletion through the existing outbox. Masters and the
audit tombstone are retained. The SHA-256 uniqueness constraint now applies only to
non-withdrawn recordings, allowing the same bytes to be uploaded under a new track
identity after removal, while still rejecting simultaneous active duplicates.
Migration: `20260918060000_track_removal.sql`. SQL regression:
`supabase/tests/track_removal.sql` (transaction rollback, no persistent fixtures).
