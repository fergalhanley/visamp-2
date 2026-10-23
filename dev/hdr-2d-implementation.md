# Complete 2D HDR presentation

Fergal authorised this implementation in the task conversation, including work
on `feature/hdr-rendering-foundation` and proceeding while Linear authentication
is unavailable. This document is the local scope/decision record until the issue
can be linked. Pushing remains manual.

## Contract and colour

Every legal 2D drawing operation except `draw::clear` accepts `intensity: 0..6`
(default 1). This scales linear-light RGB, independently of coverage/alpha.
Rotation, transform stacks, rounded shapes, strokes, gradients, text, images,
ordered compositing, effects and scramble must not disable HDR.

Rust emits version 2 ordered commands after interpretation, using the same path
builder and transform matrices as the Canvas2D backend. The player rasterises
individual commands with browser Canvas2D, preserving browser font, path,
gradient and image coverage semantics. This is a hybrid rasterisation backend:
Canvas2D supplies bounded SDR paint/coverage per operation; WebGPU decodes sRGB,
applies intensity, and composites into persistent premultiplied `rgba16float`
textures. It never uploads the final SDR scene to simulate HDR. All subsequent
blending, effects and feedback operate on float textures. Rasterisation can be
replaced by GPU geometry/glyph atlases without changing the engine contract.

Working primaries are linear sRGB. Presentation uses an sRGB extended-range
canvas with premultiplied alpha, with the sRGB transfer function applied at output; intensity 1 retains
reference-white colour. Alpha/additive/multiply/copy follow premultiplied
compositing equations. RGB is not clamped to alpha or 1. Alpha remains 0..1. Values are bounded by the finite half-float storage maximum
(65504), so long-running additive feedback cannot overflow to infinity. During HDR
presentation the SDR stage is transparent but still receives input.
Filters run in linear light, clamp negative results only, and do not feed their
output back into scene/scramble history. Scramble keeps its addressing and
60 Hz refresh cadence, but uses float colour instead of legacy byte rounding.
When a scramble preset moves RGB into alpha, alpha is bounded independently.

WebGPU is attempted for any 2D source when automatic HDR is enabled, including
implicit 2D and effects that generate HDR without an intensity argument. Once a
valid frame is rendered, the HDR surface stays selected through dark/empty
frames. Script activation, dimensions, device loss and teardown reset resources.
Frame sequence numbers prevent applying feedback twice to the same engine frame.
The original SDR stage remains the fallback for unavailable/failed WebGPU.
Existing PNG thumbnail/capture remains the engine's SDR rendering, not HDR export.

## Acceptance checks

- All applicable ops accept intensity and reject nonfinite/out-of-range values.
- The reported rotating circle/rectangle scene renders continuously.
- Shared geometry, rotation pivots, nested transforms, block boundaries, stroke
  caps/joins, both gradient types, image opacity and text remain represented.
- Ordered clear/background and all four blend modes preserve HDR and alpha.
- All existing 2D filters/effects and 40 scramble types retain extended colour.
- History persists without clear, is isolated from postprocessing, and resets on
  resize/reload; duplicate snapshots do not advance it.
- Setup failure, loss, stale async initialization and unmount release resources
  and leave usable SDR. Drawing buffers do not affect layout size.
- Native engine, player, web tests/typechecks and production build pass. Shader
  validation and a real WASM command integration check accompany these checks.
- Browser/display acceptance on an HDR-capable machine remains a separate manual
  gate if this host cannot launch its browser. Do not claim physical HDR output
  or performance has been verified by mocked GPU tests.

## Performance bounds

Retain renderer textures and pipelines between frames and cap command/path counts.
Individual raster uploads currently cost one canvas upload per draw; dense scenes
need browser profiling before claiming production performance parity. No GPU
readback is performed during playback. The full implementation must not silently
omit commands when a resource limit is hit: show the SDR fallback with a diagnostic.

## Verification record — 2026-10-23

Automated verification passed:

- `pnpm -r --no-bail --if-present test`: engine, player, docs and validator suites;
  five pre-existing deployment/auth-dependent validator tests skipped.
- Final engine rerun: 327 tests. Final player rerun: 43 tests.
- `pnpm --filter @visamp/web run '/^test:/'`: 382 Vitest tests and 60 Node tests;
  the subsequent 2D-to-3D visibility regression also passes (six HDR lifecycle
  tests in the final targeted rerun).
- `pnpm --filter @visamp/engine build` and the real WASM coverage test passed
  after sharing the existing path tessellation instead of charging the execution
  budget twice. The stub verifies interpretation/commands, not rendered pixels.
- Player/web typechecks and the final production web build passed.
- Docs: 72 complete examples compile; generated-page local links pass.
- All three generated WGSL modules parse and validate with Naga 30.0.1. The
  validator ran from a temporary Cargo project using cached dependencies; no
  runtime package or lockfile dependency was added to the application.
- Edited web files pass ESLint. Player source lies outside that ESLint config;
  its TypeScript check passes. React lifecycle review covers cancellation,
  ownership, pause/resume, fallback, asset readiness and absolute canvas sizing.

**Pending acceptance:** actual browser GPU execution, physical HDR brightness and
frame-time profiling. Chromium headless exits during macOS startup on this host;
a native wgpu probe detects Apple M5 Pro/Metal but `request_device` returns
`Device(Lost)`. Mock GPU tests and shader validation do not establish pixel output
or performance. This implementation is for review on the HDR branch, not a claim
that the display acceptance gate is complete.

Manual verification: run `pnpm dev`, open `/dev/hdr-2d`, start the comparison, and
check the rotating starter scene and both `dev/hdr-2d-*.viscript` scenes. Check
reference intensity 1 against SDR and brighter 2/4 highlights on an HDR display;
exercise background-free trails, all blend modes, effects/scramble, resize,
pause/resume and switching between 2D and 3D in the editor. Image/displacement
checks need a registered bitmap/vector asset. Verify input still reaches the
stage and that the viewport height stays fixed. Dense scenes require profiling
because this implementation uploads rasterised paint per draw operation.
