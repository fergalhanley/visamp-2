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
builder and transform matrices as the Canvas2D backend. Solid alpha-blended lines
(butt/square caps), rectangle fills and backgrounds use instanced GPU geometry,
including affine transforms and per-shape rotation. Analytic coverage retains
fractional-pixel strokes. Other commands use browser Canvas2D, preserving browser
font, complex path, gradient and image coverage semantics. This is a hybrid backend:
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

Automatic HDR selects 2D scripts with an explicit drawing `intensity` argument,
detected in the parsed AST, including functions and conditional branches. Dynamic
values and explicit intensity 1 opt in. Comments, strings and effect intensity
do not. Scripts without drawing intensity retain the native SDR path without
command recording or a second rendering loop. Recording starts only after GPU
setup succeeds, or when the explicit comparison preview is enabled. Once a
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
Contiguous compatible paints share one instanced draw; flush before a raster
fallback or clear to preserve ordering. Instance buffers are reused. For the
640-line scene plus translucent fade, geometry occupies at most 35,896 bytes and
one pass, followed by four effects and presentation: six steady-state passes,
with no canvas uploads in HDR replay. Unsupported geometry/paint combinations
still cost one canvas upload per draw and need further optimisation if profiling
identifies them as a bottleneck. Complex paths, gradients, text, images and
non-alpha blend modes currently retain this fallback.

The native scene stays current for SDR fallback. Its postprocessing is skipped
while automatic HDR is presenting, except for scramble, whose independent SDR
history must remain current. Capture re-renders through its own SDR pipeline.
This avoids duplicating the user's four effects; it does not eliminate native
scene drawing or JSON recording in HDR mode. No GPU
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
stage and that the viewport height stays fixed.

Performance regression fixture: `dev/hdr-2d-lines.viscript` reproduces the reported
scene with `intensity: hdr_intensity` on both lines. Remove those two arguments
to test the original SDR route; setting the property to 1 still selects HDR.
Measure both versions with the same viewport/device scale and animation time,
especially around 15.7 seconds (640 lines). Test intensity 3, rotated lines and
thin strokes, trail retention and all four effects. Actual frame times and pixel
output still require the user's browser; structural pass-count tests do not
prove a return to 120 FPS.

## Performance fix verification — 2026-10-23

- Workspace suites pass: 328 native engine tests, player regressions, docs and
  validator tests (five deployment/auth-dependent validator cases remain skipped).
- Web suites pass: 385 Vitest tests and 60 Node tests. Updated engine mocks cover
  the new intent query, including SDR-to-HDR activation, fallback and explicit
  comparison previews keeping the SDR pipeline enabled.
- Player and web typechecks, WASM build, production web build and edited web
  files' ESLint checks pass. All 72 complete documentation examples compile.
- Real WASM executes the dense fixture's drawing loop at peak time: 640 native
  strokes, no recorded SDR frame, then 641 HDR commands after opting in. This
  Canvas2D stub omits effects; the GPU mock separately verifies the four-effect
  chain, six passes, zero image uploads, buffer reuse and ordered fallback/clear.
- The new geometry WGSL module parses and validates with Naga 30.0.1. CPU packing
  tests cover subpixel width, premultiplied HDR colour, affine/shape rotation,
  reflection, square caps and fallback of unsupported paths/paints.
- Browser FPS, visual parity of analytic antialiasing and physical HDR output
  remain pending on the user's GPU, as described above.

## VIS-171: HDR brightness when controls hide — 2026-10-25

Production report: `/vis/gamma-bars` loses HDR highlights when player controls
hide, and regains them while the controls are visible. The reported setup is
Chrome 155 on a MacBook Pro built-in XDR display.

This matches [Chromium issue 567321057](https://issues.chromium.org/issues/567321057):
an extended WebGPU canvas on macOS can present as SDR without another element
forcing HDR compositing. The player's fading controls have a backdrop filter.
The standalone HDR experiment already used a transparent `blur(0px)` backdrop
layer, but the shared player's equivalent workaround defaulted off.

The player now enables that existing layer automatically for macOS Chromium
153–156. Chromium reports the fix in M157; M156 backports vary. Safari, iOS,
Windows/Linux and newer Chromium do not receive the automatic workaround.
Explicit `hdrCompositingWorkaround={true|false}` overrides detection for diagnosis.
Detection runs after hydration and the layer exists only alongside an HDR canvas;
ordinary SDR scenes retain their native rendering path. The layer covers the HDR
viewport, is transparent and pointer-events-disabled, and is independent of
controls, pause state and panel visibility. No shader/intensity changes or new
animation loops are introduced. GPU failure still hides the HDR container and
restores SDR.

Verification: 76 player tests, 400 web Vitest tests, player/web typechecks and
`pnpm lint` pass. Regressions cover browser/version selection, explicit overrides,
the layer surviving control hiding and pause, SDR exclusion and fallback.

Physical acceptance remains pending: on the reported Chrome 155/XDR setup, open
the patched local `/vis/gamma-bars`, let all controls hide for at least five
seconds, then repeat reveal/hide and pause/resume. Compare highlights with
controls visible and hidden, check fullscreen and input, and compare frame rate
with the same viewport. A reported extended canvas mode, mock GPU tests or an SDR
screenshot cannot establish physical HDR luminance or compositor cost.

The fix is prepared on the user-approved production-equivalent checkout for
manager-agent integration. `origin/develop` predates HDR, so branch reconciliation
and production release are separate from this patch; no deployment is implied.
