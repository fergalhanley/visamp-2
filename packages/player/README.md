# @visamp/player

React wrapper for the Visamp WebAssembly engine.

## Asset readiness

Hosts can pass `assetPreparation` (`status`, `missing`, `retry`, viewer `scope`)
with `assets`. Source validation still reports editor diagnostics while assets
load, but script initialisation waits for `ready`. Registration and script
loading happen synchronously in that order, so the first frame and `on_init`
have the complete asset set. The previous visualisation keeps playing during
preparation. On first load, `posterUrl` supplies a thumbnail behind the loading
message. Missing references show an error with Retry. Capture is unavailable
until the requested source and asset set are active. Changing viewer scope
clears the previous assets and playback before preparing the new session.

The web host caches up to 64 MiB of decoded textures/model arrays, evicting the
least recently used data first. Active engine assets are separate from this
cache. Pending downloads are shared, failures can retry, and identity changes
invalidate cached/pending data. Every selection, retry and viewer change rechecks readable, ready,
non-withdrawn asset rows before cache reuse. Metadata/download requests have a
20-second timeout. Asset ids/object keys identify immutable uploads.

The web player prepares the next sequential visualisation after the current
assets are ready (500 ms delay); shuffle mode does not guess a next item. Tiles
preload on hover/focus after 150 ms, cancelled if intent ends before then.
Speculative preparation uses the same decoded cache as activation. This does
not implement VIS-55's withdrawal repair window or privacy transitions.
