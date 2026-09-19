# Artist heroes and preferred tracks (VIS-141)

Public artist pages keep the biography and typed links above Tracks / Visualisations
tabs. The hero uses an independently uploaded banner with an overlaid artist avatar
and title. No About tab is used. Missing banners use the bundled abstract fallback.

Owners upload banners in `/manage-artists` → Artist Profile. The existing authenticated
image endpoint accepts `?image=banner`, checks ownership before processing, validates
JPEG/PNG/WebP up to 4 MiB/25 megapixels, strips metadata and stores a centre-cropped
WebP bounded to 2400 × 800 under `artist-banners/<artist-id>/`. The avatar remains
unchanged. Failed database writes delete their new object; replaced objects follow
the existing artwork retention policy. Banner URLs use the artwork redirect endpoint.

Each visualisation optionally stores `preferred_track_id`, selected or cleared on
`/edit` and included in the existing autosave. Only currently playable hosted tracks
may be newly selected; a database trigger enforces the live/licence gate even for
direct client writes. Unavailable existing choices do not block unrelated edits and
can be cleared. Foreign-key deletion clears the association. Existing ownership RLS
and column grants apply. Forks start without a preferred track.

The artist Visualisations tab uses an anonymous public query, filtered by the artist's
playable track IDs. It displays up to 200 recent matching visuals, independently of
who made them. The existing hosted catalogue bounds apply (500 candidate tracks).
Private visualisations and withdrawn/unlicensed tracks are excluded. The editor's
selector uses the same hosted catalogue.

On player startup or visualisation change, the preferred track is a fallback:
explicit tracks, playlist/favourites playback, saved SoundCloud playlists, local
files, microphone and deliberate silence take precedence. Automatic preferred-track
playback is not an explicit listener selection; the next visual can use its own
preference. Requests recheck the active visual and listener choice before starting.
The existing user-gesture retry handles browser autoplay restrictions. Unavailable
preferred music does not prevent the visual from rendering. On a fresh session, the existing default
SoundCloud playlist remains the fallback for visuals with no preference.

Apply migrations `20260919110000_artist_banner.sql` and
`20260919111500_visualisation_preferred_track.sql` before deploying the web change.
Both were applied individually after rollback validation; no bulk migration push.
SQL checks: `supabase/tests/visualisation_preferred_track.sql` (requires playable music).
Tests cover image bounds/ownership, preview refresh, public filtering, track autosave,
listener precedence and delayed-request races. Browser verification uses temporary
fixtures, removed after testing.

Verification also exposed an existing SQL rate-limit defect: `current_time` was
parsed as SQL CURRENT_TIME rather than the intended timestamptz variable. Migration
`20260919113000_rate_limit_clock.sql` renames it to `v_now`, preserving limits and
grants. Regression SQL checks admission, exhaustion, date-aware windows and reset.
The fix was applied and committed separately before final playback verification.
Media CORS permits localhost:3000, so real audio verification uses that origin.
