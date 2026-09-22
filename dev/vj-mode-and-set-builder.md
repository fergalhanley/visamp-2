# VJ Mode and Set Builder MVP contract

Approved by Fergal, 2026-09-21. Tracking: [VIS-38](https://linear.app/visamp/issue/VIS-38)
(contract), [VIS-44](https://linear.app/visamp/issue/VIS-44) (foundations and builder),
[VIS-45](https://linear.app/visamp/issue/VIS-45) (VJ and production output).
Implementation is delivered with VIS-44/VIS-45. See [implementation and verification](vj-implementation.md) for architecture, operating instructions, checks and remaining manual acceptance work. Linear remains authoritative for delivery status.

Fergal explicitly confirmed that the new requirements supersede conflicting older
requirements in VIS-38, VIS-44, VIS-45 and VIS-75. In particular: sets are private,
all supported audio sources are eligible, running schedules are frozen snapshots,
visual revisions are pinned where available, errors are reported, and looping
restarts at zero. Live editing of a running programme, public set sharing,
hosted-only restrictions and designed end-to-start overlaps are not MVP requirements.
VIS-75 retains broadcast operations and launch prerequisites, not competing player
requirements. Beta release timing is separate from implementation on develop.

## Purpose and boundaries

Set Builder determines what plays and when. VJ Mode runs that programme with
independent temporary audio and visual overrides. Desktop browsers are the MVP
platform. Reuse the existing Visamp catalogues, audio adapters, visual player,
asset preparation and runtime; do not create another rendering system.

A single pure scheduler and transport abstraction serve builder preview, embedded
VJ output and pop-out output. Only one output owns rendering and audio resources.
Manual VJ selections never change or autosave the saved set.

## Routes and authentication

| Route | Behaviour |
| --- | --- |
| `/sets` | Owner's sets; name, duration, updated time, computed Draft/Ready, Edit, Open in VJ Mode, Duplicate, confirmed Delete, New Set |
| `/sets/new` | Authenticated create flow; redirect to the created editor |
| `/sets/[setId]/edit` | Private owner editor |
| `/vj-mode` | Recent sets, searchable selector or Start without a set |
| `/vj-mode?set=<setId>` | Load the owner's saved set |
| `/vj-mode/output/<sessionId>` | Authenticated same-origin clean session output |

These are new dedicated routes, not a timeline embedded in visual `/edit`.
`/set/<id>` is a superseded proposal, not a public sharing contract to implement.
Existing listening routes remain intact.

The desktop top bar has a magenta VJ Mode action with sufficient contrast, including
when signed out. Use the existing sign-in flow and preserve `/vj-mode` after auth.
Direct protected visits preserve their original path and query through sign-in;
validate return paths using existing safe-return handling. Set Builder entries are
visible only when signed in; the authenticated `/edit` bar links to `/sets`.
Recent-set menus are optional, not a prerequisite for that entry point.

## Persisted document and content references

```ts
type SetDocument = {
  id: string;
  ownerId: string;
  name: string;
  description?: string;
  schemaVersion: 1;
  loop: boolean; // default false
  aspectRatio: '16:9';
  audioClips: AudioClip[];
  visualClips: VisualClip[];
  createdAt: string;
  updatedAt: string;
};
type AudioClip = {
  id: string;
  trackId: string;
  startMs: number;
  sourceOffsetMs: number;
  durationMs: number;
  fadeInMs: number;
  fadeOutMs: number;
};
type VisualClip = {
  id: string;
  visualisationId: string;
  visualisationRevisionId?: string;
  startMs: number;
  durationMs: number;
  fadeInMs: number;
  fadeOutMs: number;
};
```

Store identity, attribution and timing, not copied media payloads. The conceptual
`trackId` must resolve through existing hosted, SoundCloud and local-file source
identities; it must not become a hosted-track-only foreign key. Persist a source
discriminator and stable source reference where the current IDs require it. Local
file bytes and transient blob URLs do not belong in the database. Resolve existing
browser-local handles/files; if unavailable, show the clip as unavailable and allow
repair/reselection. Do not ban local audio or impose broadcast-portability rules.
A catalogue item's creator/artist attribution must remain identifiable in set data
and visible in selection UI. Identity metadata cannot grant playback permission.

Owner comes from authenticated server context, never a trusted client field.
Enforce ownership for every read/write/duplicate/delete in the API and database
RLS. Duplicates receive new set and clip IDs and belong to the requesting owner.
There is no public set discovery, sharing or collaborative access in MVP.

Resolve content using existing search, ownership, visibility and playback rules.
Private/deleted/missing/unauthorised content remains an identifiable unavailable
clip, never a substituted item. Users can reopen and repair invalid drafts.
Validate timing server-side and in the editor; resolve authorisation server-side
where applicable and browser-local availability in the client.

All persisted times are finite safe integer milliseconds. Starts, offsets and
fades are nonnegative; durations are positive; clip end must remain representable.
For known audio duration, offset plus duration cannot exceed source duration.
Fades cannot exceed clip duration. Set duration is the maximum clip end, or zero
for an empty set. Ready requires a nonempty name, at least one clip in each lane,
and no validation errors. Empty/invalid drafts remain savable; malformed or unsafe
payloads are rejected independently of readiness validation.

## Scheduling and transitions

For time `t`, select clips using `start <= t < start + duration`. Return active
clips/pairs, gain/opacity, audio source position `sourceOffsetMs + t - startMs`, and
the next affecting boundary. Seeking computes the same result directly, including
inside transitions; no replay from zero is required. The pure calculation must
have no React, DOM, timer or media-element dependency.

Only adjacent pair overlaps represent transitions. Reject nested/triple or other
unrepresentable overlaps. Dragging clips together creates/updates matching incoming
and outgoing fades over the overlap; explicit inspector fades also apply at clip
edges. Transition progress `p` spans zero to one across overlap:

- Audio outgoing gain `cos(p * PI / 2)`, incoming `sin(p * PI / 2)`.
- Visual outgoing opacity `1 - p`, incoming `p`.
- Isolated fades use the same lane curve towards/from silence or black.

Gaps warn, rather than prevent Ready: audio is silent, visuals are black, and the
set clock continues. Report leading, internal and trailing gaps against derived set
duration. Invalid timing, unavailable content, empty lanes and unrepresentable
transitions are blocking errors. Warnings are summarised before VJ launch.

Use true dual-render visual dissolves only where stable. A clearly labelled
fade-through-black fallback is permitted. The current singleton WASM player does
not establish dual-render capability; merely hiding its canvas is not disposal.
Do not claim a dissolve when only one instance is rendering.

The transport consumes a frozen in-memory set snapshot. Audio clock is the timing
source while audio is active; use a continuous monotonic clock anchor through gaps
and output handoffs. Do not advance fades with independent interval timers. Sample
clock time to derive schedule, rather than accumulating frame/timer deltas.

Shared transport API: load, play, pause, stop, seek, current time/duration/state,
active scheduled audio/visual, gain/opacity application, independent override
selection/clear, normalised input, and recoverable/fatal error reporting. Loop mode
initialises from the set but is controllable during preview/performance. At end,
loop seeks to zero and continues; otherwise stop on black/silence with Set complete.

## Set Builder interaction contract

Desktop layout has three vertical regions: normal navigation and name/save/actions;
catalogue left with 16:9 preview and transport right; full-width timeline below.
Persist the draggable timeline divider per browser and enforce usable minimums.
Catalogue tabs reuse the existing Visualisations and Audio slide-out functionality,
including filters/search/attribution; provide preview, compatible-lane drag and
keyboard-accessible Add actions.

Exactly one audio and one visual lane, ruler, playhead, labelled/resizable clip
blocks, lane icons/colours and unavailable error treatment. Support:

- Drag to add/move and left/right-edge trim; inspector alternatives for all timing.
- Click selection; Delete/Backspace removes only outside text fields; Undo recovers.
- Click/drag ruler seek, horizontal scroll, zoom, duration and timecode.
- Snap to playhead, neighbouring boundaries and whole seconds; modifier disables.
- Fixed small keyboard nudge; in-memory undo/redo for add/remove/move/trim/fades.

Audio defaults: offset zero, full available duration, position at drop or audio end,
zero fades until overlap. Visual defaults: drop position or visual end, duration to
next visual, current audio end or sensible default if no audio. Inspectors expose
start/duration/fades and audio source offset exactly. Display `HH:MM:SS.mmm` where
precision matters; short transport may use `MM:SS`.

Transport: jump to start, play/pause, stop, time/duration, preview loop, volume/mute
and existing quality controls where supported. Structural edits pause playback
before applying changes. Paused playhead changes are allowed. Running preview uses
the same scheduler/transitions as VJ.

Set controls: required name, optional description, loop default off, 16:9 aspect and
computed Draft/Ready. Existing sets autosave with a short debounce and visible
Saving… / Saved / Save failed plus Retry. Retain local state on failure; warn on
navigation with unsaved edits. A save response must not overwrite newer edits or
change a running snapshot. Open in VJ Mode saves successfully before navigating;
errors open validation summary, warnings are summarised without blocking playback.

## Embedded VJ and overrides

Three columns: visual catalogue, audio catalogue, wider performance workspace with
preview above transport/programme/Input Controller. Persist draggable column widths
and horizontal split; collapse catalogues into tabs on narrower desktop widths.
Starting without a set permits manual content selection, with set clock and next
schedule disabled. Loading another set during playback confirms and stops output.

Show set name, transport/restart/loop/time, current and next audio/visual with time
until change, compact progress timeline (drag seek while paused), output status and
applicable clear-override actions. Audio and visual selections start independent
LIVE OVERRIDE states. The set clock and schedule continue underneath; overrides
persist across scheduled boundaries. Return to Set rejoins the current calculated
scheduled position, not the interrupted point. Use a short fixed crossfade on audio
entry/return and a short visual dissolve or labelled fade-through-black fallback.
Overrides never edit/autosave the programme.

## Output authority and session protocol

Pop out output opens only after a gesture, on the same origin. Output contains only
a clean 16:9 surface, optionally neutral loading/error black, without navigation,
transport, cursor, focus ring or operator errors. Suitable for OBS window capture.

After a verified output handshake, the pop-out owns all audible and rendered output.
Fully stop/release embedded renderer, animation loop, graph and media resources;
replace it with a connection/status placeholder, not a live monitor. Window.open
returning an object does not establish a live connection. Only one output connection
may own the session; a new connection supersedes the old one.

BroadcastChannel is primary; use same-origin postMessage fallback as needed. Every
message includes protocol version, session ID, monotonically increasing sequence,
type and validated payload. Each sender/connection tracks its sequence; a restarted
sender negotiates a new connection before its sequence restarts. Reject incompatible
versions, wrong session/origin, stale connections and malformed messages. A gap or
new connection requests full state before dependent deltas are applied. Coalesce
pointer movement to at most one send per animation frame.

Required messages: hello/ready/heartbeat/disconnect; snapshot request/full snapshot;
load frozen set; play/pause/stop/seek; scheduled-state update; set/clear each override;
keyboard/pointer/wheel; output metrics; playback state/error. Snapshot includes the
frozen set, transport clock anchor and state, loop/volume/mute, active overrides,
content resolution context and output ownership generation. Refresh/reconnect must
recover without a new user selection; autoplay denial remains an explicit operator
action. A message cannot bypass content authorisation or confer account access.

Heartbeat loss shows a warning and releases Input Controller capture. Operator
clock must continue, then rebuild embedded output at the current calculated time
and restore its authority. Show Pop-out disconnected and offer Reopen after recovery.
Late/stale output must not resume duplicate audio. Reload offers last coarse session
position from local persistence, with a gesture required before audible resume.

## Input Controller and runtime adapter

Focusable 16:9 pad below preview represents output coordinates. Idle instruction:
Click to control output, with Escape-release explanation. Capture begins only on
explicit click; request pointer lock and show INPUT CAPTURED — ESC TO RELEASE.
Release and clear held state on Escape, lock loss, blur, route change or output
disconnection. Never capture from text inputs or normal controls, or suppress
reserved OS/browser combinations. Safe forwarded keys prevent browser defaults.

```ts
type VisualInputEvent =
  | { type: 'key'; action: 'down' | 'up'; code: string; repeat: boolean; modifiers: string[]; t: number }
  | { type: 'pointer'; action: 'move' | 'down' | 'up'; x?: number; y?: number; dx: number; dy: number; button?: number; buttons: number; t: number }
  | { type: 'wheel'; dx: number; dy: number; dz: number; t: number };
```

Use normalised absolute x/y in 0..1 where available, relative motion under pointer
lock, and normalised wheel units. Adapter translates these device-independent
messages into existing runtime queue_input/clear_input contracts; never forward raw
DOM events. The same adapter serves embedded and pop-out. On release/reset clear
engine held keys/buttons even when no key-up arrived.

Pad text shows capture state, pressed KeyboardEvent.code values, button mask,
absolute position, relative delta, wheel delta, destination and last-event age or
count. Keep focus indicators elsewhere and persistent text status, not colour alone.
Motion reduction affects editor animation, not authored output.

## Failure and analytics contract

Failed audio: operator error, continue clock, try next scheduled boundary, no endless
retry. Failed visual: operator error, black until next valid clip/override. Render
crash: preserve operator state and offer Restart Output. Content unavailable after
load: retain frozen snapshot where technically possible, otherwise the corresponding
failure behaviour. Never promise cached snapshots can bypass revoked media access.

Use existing consent and stage/prod environment property. Events: set_created,
set_opened, set_clip_added, set_preview_started, set_validation_failed,
set_opened_in_vj_mode, vj_session_started, vj_set_started, vj_output_popped_out,
vj_output_disconnected, vj_input_capture_started, vj_override_started (audio/visual),
vj_override_cleared, vj_playback_error (non-sensitive category), vj_set_completed.
No raw keys, coordinates, set names or other authored content in analytics.

## Delivery and acceptance gates

1. VIS-44 phase 1: persisted schema/ownership/validation, pure scheduler and shared
   transport API, protected set routes and basic list/create/delete.
2. VIS-44 phase 2: full two-lane builder, catalogue reuse, drag/add/move/trim/remove,
   snapping/zoom/seek, inspectors/history/autosave/validation and preview transitions.
3. VIS-45 phase 3: embedded VJ layout/selection/transport/current-next, playback,
   independent overrides and Input Controller into existing runtime.
4. VIS-45 phase 4: clean authoritative pop-out, protocol/heartbeat/snapshots/recovery,
   input forwarding, failure handling and long-running verification.

Set Builder acceptance: authenticated create/rename/save/reopen/duplicate/delete;
audio/visual add and drag; move/trim/remove/precise timing; audible and visible
transitions; arbitrary seek; preview/VJ schedule parity; blocking invalid/unavailable
content and nonblocking gaps; undo/redo; valid saved set opens directly in VJ.

VJ acceptance: signed-out top-bar auth return; load/play/pause/stop/restart/seek/loop;
current/next identification; independent overrides and correct Return to Set;
gesture-opened clean output; reliable transport/seek/override/input; complete state
after refresh; embedded recovery at current time after close; explicit input arming
and Escape/blur release; all key/pointer/button/wheel events reach either output;
operator UI/errors absent from capture.

Automated minimum: scheduler boundaries/overlaps; fade start/mid/end; transition
seek; timing/gaps/missing content/offset validation; duration; add/move/trim/remove
undo/redo; message schema/version/session rejection; reconnect snapshots; overrides
across boundaries and return; auth return URLs. Add ownership/persistence checks
when implementing APIs. No documentation-only change demonstrates these behaviours.

Browser flow: create set, add two audio tracks and two visuals, overlap both lanes,
save/preview, open VJ, pop out, visual override, forward input, return to schedule,
close output and verify embedded recovery. Manual gates: Chromium, intended OBS
capture, autoplay, pointer lock, dual monitors and one-hour soak. Record actual
evidence and leave unavailable manual checks pending, never inferred from unit tests.

Out of scope: broadcast platform APIs, OBS control, public/collaborative sets, extra
lanes, BPM/beat grids/quantisation/cues/waveforms, live mic/device mixing, MIDI/OSC/
Stream Deck/gamepad/DMX, effect panels beyond existing input, recording/server
rendering, overlays/chat, multi-set channel scheduling and OS crash restart.


## Set Builder interaction update (VIS-163)

Visual clips added from the catalogue or dropped onto the timeline start at 30
seconds. Clip moves and trims snap to both lanes' edges and the playhead within
18 screen pixels (a larger time window when zoomed out), ahead of whole-second
snapping. Moving a clip can snap either endpoint; Alt/Shift bypasses snapping.

Space toggles playback from the marker, including while timeline controls have
focus; text entry and armed output input remain excluded. Ruler seeking starts
playback immediately using the already resolved media, without reloading the set.
Cmd/Ctrl+C copies the selected clip within the editor session; Cmd/Ctrl+V pastes a
new clip at the marker, preserving its source and trim, and supports Undo/Redo.
Pinch zoom anchors at the gesture position; the zoom slider uses the last pointer
position over the timeline (or viewport centre). Scroll limits still apply.
