# LFO modulation Phase 1

Authorised by the active handoff in AGENTS.md on `feature/lfo-modulation-core`.
Keep draft PR #15 on its existing target; do not merge or deploy. No Linear issue
ID was provided. This document records the implementation choices for review.

## Host API and persistence boundary

```tsx
import { VisampCanvas, defaultModulationConfig } from "@visamp/player";

const modulation = defaultModulationConfig(120);
modulation.lfos[0]!.enabled = true;
modulation.routes = [
  { lfoId: "lfo-1", property: "rotation", min: -0.8, max: 0.8, enabled: true },
];
// Supply a new immutable object when updating settings. Removal/null clears it.
<VisampCanvas source={source} modulation={modulation} active={playing} />;
```

The version 1 JSON shape is `{ version: 1, bpm, beatsPerBar, lfos, routes }`.
It supports up to four uniquely named oscillators and 64 numeric-property routes.
Each oscillator has `id`, `waveform`, `barsPerCycle` (1/16–16), `phase` in cycles,
`polarity`, `enabled`, and a uint32 `seed`. Each route has `lfoId`, `property`,
`min`, `max`, and `enabled`. Unknown fields/versions, duplicate IDs, invalid flags,
nonfinite numbers, absent targets and nonnumeric targets are errors. Disabled
routes must still reference valid oscillators and numeric properties.

A visualisation can own the optional `modulation` field alongside its existing
source: `JSON.stringify({ source, modulation })`. `dev/lfo-phase1.ts` supplies a
complete example. Phase 1 makes no database migrations or editor persistence
changes. Future VJ-set overrides can supply a separate config to the player;
they need not overwrite the visualisation's saved default.

Lower-level hosts can call `configureModulation(engine, config)` after successful
`load_script`, or `engine.set_modulation_config(JSON.stringify(config))` directly.
JSON `null` removes the bank. The WASM setter independently validates and atomically
replaces it; invalid input leaves the previous valid configuration intact. The
React wrapper reports rejected replacements through `onLog` and clears previous
modulation to avoid silently continuing an obsolete declarative configuration.
There is no per-frame JS callback, no inspector-driven mutation, and no new clock.

## Routing and base values

For each enabled, nonzero-depth route, convert its oscillator sample to -1..1,
multiply by `(max - min) / 2`, and add that offset to the current base property.
Sum offsets for a property, then clamp to the intersection of the active ranges.
Thus a base at the midpoint sweeps the specified range; off-centre base values
retain their offset and can spend time at a clamp boundary. Unipolar and bipolar
waveforms traverse the same route depth; polarity affects raw evaluator output.

- Zero depth (`min == max`) is a complete no-op, including clamping.
- Disabled routes/oscillators contribute neither offsets nor clamp bounds.
- Empty intersections are rejected, rather than silently dropping clamps.
- Property reads apply the frame's rules to the **current** numeric base. Lifecycle
  and render-block assignments therefore take effect in the same frame.
- For a direct property assignment, self-reads on its RHS use the base, including
  through helper functions: `angle = angle + 1` increments base once, then drawing
  reads the modulated value. Other property reads remain effective, so
  `derived = angle * 2` can intentionally use modulation. Indirect script feedback
  remains the author's responsibility; this is not a general dependency solver.
- Local variables and function parameters take precedence over globals. Functions
  still cannot assign global properties. Modulated integer properties produce
  floating effective values; removing modulation restores the original base type.
- A target that becomes nonnumeric at runtime raises a located runtime error when
  read; modulation never coerces strings/booleans/arrays into numeric values.
- `get_properties()` retains its existing base-value contract. It is not a proxy
  for effective values. Stored values change only through normal script writes.

The model owns the configuration. Successful script reload creates a fresh model,
clearing config and frame rules; the React host explicitly re-applies its current
config after activation and before yielding to the next frame. Failed parsing
retains the previous model. Removing configuration or unmounting clears it.

## Timeline and rendering

The engine advances its existing `FrameClock`, samples each LFO once, and installs
property-read rules before input, `on_frame`, and render blocks. Capture clones
that clock/model state, preserving the current modulation without advancing time
or writing back capture mutations. SDR/HDR pipelines are unchanged.

Waveforms: sine, triangle, square, saw-up, saw-down and seeded sample-and-hold.
Phase is measured in cycles; negative times use floor-based wrapping. Random
samples are a uint32 hash of the floor cycle and seed, so the same cycle is stable
regardless of seek order or frame cadence (the hash repeats after 2^32 steps).

Pause freezes the existing clock; explicit seek still works while paused.
`setAnimationTime(null)` releases external timeline ownership. Tempo changes
recompute phase from the absolute timeline using the new BPM: deterministic,
but not phase-continuous live tempo automation. A future tempo map would require
its own versioned contract. Very large timelines beyond safe integer cycle counts
are rejected rather than producing non-reproducible random boundaries.

## Smoke test

Run `pnpm dev` and open `/dev/lfo`. This development-only harness shows an existing
2D rectangle whose rotation and zoom are modulated without editing its source.
Playback starts automatically on arrival. Pause, seek to 0.5 s, release seek,
resume, and turn modulation off. Startup status and compile/load errors appear
above the canvas. With modulation
off it returns to rotation 0 and zoom 1. The harness is unavailable in production;
it is not the Phase 2 editor panel or Phase 3 performance controls.

`pnpm --filter @visamp/web test:lfo` runs the real WASM against a recording
Canvas2D context, checking the same example in SDR and HDR, zoom/rotation, base
preservation, reload/reset, pause/seek and TS/Rust waveform parity. It verifies
actual draw inputs, not GPU pixels. Native tests also inspect 3D scene transforms
and interpreter precedence. Browser/display evidence is recorded separately.

## Verification record — 2026-10-24

- `pnpm -r --no-bail --if-present test`: passed, including 338 native Rust tests,
  63 player tests, four docs tests and three validator tests. Five existing
  deployment/auth-dependent validator tests are skipped.
- `pnpm --filter @visamp/web run '/^test:/'`: passed (388 Vitest tests and 61 Node
  tests, including real-WASM LFO and HDR checks and the source/config replacement
  lifecycle regression).
- `pnpm --filter @visamp/player check-types` and
  `pnpm --filter @visamp/web check-types`: passed.
- `pnpm --filter @visamp/web build`: passed.
- `packages/engine/with-toolchain.sh bash packages/engine/check-compiler-parity.sh`:
  native/release WASM builds pass; compiler targets match at 5.2.1. `wasm-opt` is
  unavailable locally, so optional Binaryen optimisation is skipped.
- Edited web files pass targeted ESLint. Full `pnpm --filter @visamp/web lint`
  fails on two unchanged pre-existing `react-hooks/set-state-in-effect` errors:
  `components/playlists/playlist-manager.tsx:23` and `components/sets/editor.tsx:61`.
  It also reports three existing warnings. These unrelated files are unchanged;
  the existing CI lint gate therefore remains a known blocker.
- Follow-up: 15 player integration tests, player/web typechecks and targeted
  web ESLint pass after adding automatic demo playback and startup diagnostics.
- Chromium launched through the IDE terminal successfully verifies `/dev/lfo`
  on local port 3001. The canvas measures 848 × 477; its centre pixel is opaque
  turquoise (64, 224, 208, 255), and a screenshot shows the rotated rectangle.
  Pixel comparisons confirm animation, pause, seek while paused, restoration
  of the unrotated 180 × 80 rectangle when modulation is disabled, and identical
  pixels after re-enabling at the same seek time. No browser errors occurred.
  This supersedes the earlier browser-launch limitation in the agent terminal.
  It verifies SDR browser output; physical HDR display acceptance is separate.

PR #15 must stay draft. No release, merge, editor UI or database persistence is
included. The new real-WASM integration command is added to the CI workflow.
