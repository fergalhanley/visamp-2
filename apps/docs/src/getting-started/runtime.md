# Runtime & capture

## A frame at a time

Visamp prepares referenced assets before activating a script. Initialization runs
once for that runtime, with `on_resize` responding to size changes. Queued input
handlers run before `on_frame`, followed by `render` for each animation frame.
Use properties to retain values between blocks; local `let` bindings belong to
their scope. See [Blocks](../language/blocks.md) for lifecycle details.

Use `$DELTA_SEC` for motion that should run at the same speed on different screens.
`$FRAME_INDEX` counts frames; it is useful for alternating patterns but is not a
clock. Wall-clock values such as `$TIME_HOUR` use the viewer's local time.

## Keep rendering responsive

Read the [cached audio snapshot](../programming/audio-detection.md) as often as
needed within a frame. Calls do not start another audio analysis. Avoid building
large arrays or issuing thousands of individual drawing calls each frame when a
point cloud can describe the same visual.

Loops have an iteration limit of 10,000 and execution also has a per-invocation
step budget. These protect playback from runaway scripts; they are not a target
for routine animation. Start with small counts and test on the target device.

## Canvas and world coordinates

2D uses pixels, with the origin at the top left. Derive layout from `$WIDTH` and
`$HEIGHT` so it follows the viewport. 3D uses world coordinates and a camera;
[overlays](../drawing/creative-tools.md) let you draw screen-space elements above
that scene. A 3D frame clears automatically; a 2D frame can retain its previous
contents unless the script clears or covers them.

## Capturing a thumbnail

**Capture thumb** renders at 1280 × 720. It uses a copy of the current runtime and
properties, runs `render`, and does not run lifecycle blocks again. Writes made
while capturing do not change live properties. Effects are rendered into the
output, so they appear in the captured image too.

Calculate viewport-dependent positions inside `render` when they must adapt to
capture dimensions. A width stored in a property during `on_init` still contains
the live viewport's width during capture. See [System Values](../programming/system-values.md).
