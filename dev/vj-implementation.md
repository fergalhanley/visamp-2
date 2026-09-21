# Set Builder and VJ Mode implementation

Tracks [VIS-44](https://linear.app/visamp/issue/VIS-44) and [VIS-45](https://linear.app/visamp/issue/VIS-45). Product contract: [MVP specification](vj-mode-and-set-builder.md).

## Use

Sign in and open `/sets`. Create a set, add or drag catalogue items to their audio/visual lane, and use the inspector for exact millisecond values. Move/trim clip edges to form overlaps. Alt or Shift disables snapping; arrows nudge a selected clip by 100 ms; Delete removes it. Undo/redo covers timing and structural changes. Ruler dragging seeks; zoom and horizontal scrolling expose longer programmes.

Edits autosave after 600 ms. Failed saves retain edits and offer Retry; concurrent saves from another window are rejected rather than overwriting them. Initial document loading disables editing. Navigation warns about unsaved edits. Availability is checked on load/reference changes and before playback. Drafts may retain invalid timing for repair; errors block scheduled playback, while gaps are warnings. Set lists compute readiness from content availability as well as timings.

Open a valid set in `/vj-mode`, or start without a set for manual operation. Selecting catalogue content creates an independent audio or visual override. Return to Set rejoins the running programme at its current position. Overrides are never saved into the set. The account-specific resume prompt restores a coarse position after a reload and requires a play gesture.

Pop out output from a click. The output window owns rendering/audio; the operator removes its embedded iframe entirely. Refresh reconnects to the current snapshot. Closing or losing the pop-out restores embedded output at the current time. If the browser blocks autoplay, click Enable audio in the output. Restart Output recreates a failed renderer.

Click the Input Controller to acquire pointer lock. It sends keyboard code/key, pointer buttons/relative movement and wheel events to the active engine. Escape, focus loss, pointer-lock loss, route changes and destination changes release capture. Browser/OS modifier shortcuts are excluded. The clean output disables native DOM input capture and reports errors to the operator.

## Architecture

- `lib/sets/model.ts` parses private schema-version-1 references/timings/attribution. `performance_sets` stores JSON documents with owner RLS; authenticated clients have SELECT only. Validated API mutations use explicit owner predicates and optimistic `updated_at` checks. Apply migration `20260921010000_sets.sql` before deploying these routes to another database.
- `scheduler.ts` is pure. Half-open clip intervals reconstruct gains, opacity, source positions and next boundaries from arbitrary set time. Audio uses equal-power fades. The current singleton renderer uses the explicitly labelled fade-through-black visual fallback.
- `SetTransport` owns a cloned playback snapshot, transport/loop state and independent overrides. Their source positions stop while paused and survive timeline loops. Editor saves cannot mutate a playing snapshot; structural edits pause and replace it.
- `PlaybackClock` follows the shared AudioContext while running, with monotonic fallback during audio suspension, errors and output handoff. Animation frames apply the schedule; UI/heartbeat intervals never advance transitions.
- `SetAudio` reuses existing hosted, SoundCloud HLS and local-file AudioEngine adapters with one context, output gain and analyser. Adjacent scheduled tracks have separate decks and equal-power gain. The next clip preloads muted within five seconds of its start. Failed decks report once and retire at the next relevant boundary. Overrides enter/leave over 300 ms.
- The existing WASM player is a realm singleton, so **all output surfaces run in a dedicated same-origin iframe/window**. Unloading the realm releases its loop, canvas, audio graph and media resources. There is no second rendering engine and no hidden embedded monitor while popped out.
- `SessionChannel` uses versioned, session-scoped BroadcastChannel messages with same-origin/source-checked postMessage fallback. Sender connection nonces handle refreshed sequence counters. Gaps request full snapshots. Output state acknowledges the last applied control sequence, preventing stale telemetry from undoing a newer seek, stop or Return to Set. Heartbeats establish connectivity; a window handle alone does not.
- Visual source and prepared assets are resolved through existing visibility/storage rules. The current catalogue has no immutable revision table, so source is frozen in memory for a running session; revision IDs remain optional in the document contract.
- Local files remain in this browser's IndexedDB, available to its same-origin pop-out. Only references/metadata are saved remotely. A missing file is marked unavailable and can be repaired by choosing the same file again. No new portability or broadcast restrictions are imposed.
- Existing consent/environment-aware analytics records feature events, never input coordinates, key presses, set names or user-authored source.

## VJ workspace layout — VIS-45, 2026-09-21

The shared top-bar action group places VJ Mode after Create and contextual actions.
VJ Mode uses the common button geometry with magenta/white styling and is hidden on
its own route; that route exposes Set Builder in the action group.

The left workspace has Freeplay Visualisations and Set tabs. Freeplay embeds the
same VPanel and APanel used by /player, including filters, favourites, playlists
and management controls. Panel selection callbacks and the VJ audio-library adapter
route playback exclusively through the shared performance controller. Browsing never
starts the normal player's audio engine. Local files are prepared in the existing
IndexedDB store before selection so pop-out playback can access them. Microphone
mixing remains outside the VJ MVP. Set loading/search/resume controls live in the Set
tab; changing tabs preserves catalogue state and does not change a running set.

Set-specific control CSS is scoped to editor/list/set controls and performance
controls, leaving shared navigation and freeplay panel styling intact.

## Verification

Automated tests cover scheduling boundaries/fades/seeking, timing and missing-content validation, history, snapshot recovery, independent overrides/loop/pause, message rejection/order, stale telemetry, auth return destinations and owner/concurrency API guards. Live database assertions confirm owner visibility, foreign-owner exclusion and revoked direct mutation/anonymous privileges.

Run `pnpm --dir apps/web test:editor`, the shared player tests, TypeScript, scoped ESLint and a production build. The repeatable Chromium flow uses the installed agent-browser CLI and an already authenticated test session:

```sh
VISAMP_BROWSER_SESSION=vis-sets node apps/web/scripts/verify-sets-browser.mjs
```

A local app and at least two public visuals and hosted tracks of at least 30 seconds are required. The script creates its own temporary set, verifies 2+2 clips and overlaps, autosave failure/retry, preview/seek, VJ loading, output detachment/refresh, override, explicit input capture, Return to Set and embedded recovery, then deletes the set. On failure it deliberately leaves that test set for inspection. No real user's set is edited.

Additional Chromium checks used an interactive visual changing colour on keyboard and pointer events, including the pop-out. These verify runtime delivery beyond the pad counter. Browser screenshots are development evidence, not production design assets.

Still requiring the owner's performance setup: OBS window capture, dual-monitor operation, and a one-hour manual soak. Do not treat this as production broadcast sign-off or mark those acceptance criteria verified until recorded. No production release is part of this implementation.

VIS-45 layout follow-up verification: 315 web tests passed; TypeScript and ESLint
passed (two existing unrelated lint warnings). The webpack production build passed;
the default Turbopack build cannot follow this task worktree's dependency symlinks.
The updated complete Chromium flow passed, including selection from the reused
visual panel while popped out. Additional browser checks confirmed hosted selection
creates an audio override without operator media elements, shared top-bar colours
and 7px radii, hidden VJ action/page heading, tab layout and no browser errors.


### Freeplay transport and output interactions — VIS-45

Freeplay embeds the shared player Transport with an external controller and no
social/info footer. Its selected catalogue context supplies previous/next and
shuffle queues. Per-track and Timed advancement follow output transport telemetry;
manual mode retains the visual when skipping audio. The validated `seek-audio`
command seeks live audio in either output realm without changing underlying set
time. Set-tab controls remain separate.

The Input Controller occupies the output slot only while the pop-out is connected.
The embedded iframe has a top-right Pop out output action; disconnect recovery
restores that action with the iframe. Pointer movement reveals the output cursor,
three seconds idle or a surface click hides it, and fullscreen pop-out keeps it
hidden. Double-clicking the pop-out surface toggles native fullscreen. Shared top
navigation now links Artists; Upload Music is in the signed-in account menu.

Verification includes transport/queue/pointer regression tests and both Chromium
flows: `verify-sets-browser.mjs` and `verify-vj-freeplay-browser.mjs`. The latter
checks seek, mode-dependent skip, output/input replacement, embedded and pop-out
cursor behavior, native double-click fullscreen and recovery. Both use an already
authenticated test browser; the Freeplay flow creates no saved content.

This iteration passed 322 web tests, TypeScript, ESLint (the same two unrelated
warnings), the webpack production build and both Chromium flows. Artists/upload
navigation was checked in the signed-in dropdown. Development hot reload can
supersede an existing output iframe; verification used fresh page loads.
