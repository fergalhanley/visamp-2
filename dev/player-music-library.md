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

## My artists

`/my-artists` is linked from the account menu, upload page and audio library.
Owners can add/select artists, edit names, bios and website URLs, and upload an
artist image. Names retain the global normalized uniqueness constraint; renaming
does not change the artist's URL. Owners can edit live/draft track titles, albums
and artwork. Withdrawn/unfinished tracks are listed but are not editable here.
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
