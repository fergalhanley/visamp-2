# Artist profile links (VIS-139)

Owners manage multiple typed links under `/manage-artists`. Public artist profiles
show the platform icon, platform label and URL below the existing biography.
The catalogue contains Website plus Spotify, Apple Music, SoundCloud, Bandcamp,
YouTube, Instagram, TikTok, Facebook, X, Threads, Bluesky, Twitch, Discord, Patreon,
Mixcloud and Beatport. This is a curated musician-oriented set of 16 platforms.

The shared client/server validator accepts up to 20 links, each at most 500
characters, with HTTP(S) URLs and no credentials or embedded whitespace. Platform
links must match their platform domain or a subdomain; Website permits other hosts.
Duplicate normalized type/URL pairs are rejected. Ownership checks still apply.

Migration `20260919030000_artist_profile_links.sql` adds the JSON links column,
backfills existing websites and validates the stored shape. A compatibility trigger
keeps edits from older website-only clients working without discarding social links.
The first Website link projects into the legacy website_url field. Apply this
migration before deploying the web changes. It was applied individually to the
configured hosted database after rollback validation; no bulk history push was used.

Platform SVG paths are vendored locally from [Simple Icons 13.21.0](https://github.com/simple-icons/simple-icons/tree/13.21.0/icons),
whose icon data is CC0. Brand marks remain subject to their respective owners' rights.
Website uses the existing Lucide Globe icon. No remote image requests are needed.

Verification covers URL/domain validation, owner API updates, add/remove UI,
legacy website compatibility, and actual save-to-public-page display using an
isolated temporary artist. SQL checks are in `supabase/tests/artist_profile_links.sql`.
