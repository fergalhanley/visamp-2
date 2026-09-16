# Shared GPU filter output (VIS-114)

## Decision

Engine 5.1.1 renders `effect::filter::*` into the output canvas. The player no
longer polls a CSS filter string, and capture no longer applies Canvas2D filters.
The Visript API, defaults, clamping and statement ordering remain unchanged.

Pipeline: scene plus overlay → scramble/feedback → ordered filters → output canvas.
Feedback retains unfiltered pixels. Filter-only Canvas2D scripts retain their
unfiltered drawing surface between frames, preserving ordinary accumulation.

Both contexts share a WebGL2 postprocessor. Canvas2D supplies a texture upload;
3D supplies a render target. Colour operations use sRGB math derived from the
[Filter Effects specification](https://www.w3.org/TR/filter-effects-1/), with
premultiplied alpha storage and per-operation clamping. Blur uses separable
Gaussian passes and a resolution pyramid for large radii. Large blur is an
approximation, not a promise of bit-identical browser CSS output. Canvas edges
are transparent and clipped. Radius is measured in canvas pixels.

## Resources and limits

Ping-pong textures, blur pyramid levels and shaders are reused across frames.
History targets are allocated only when scramble runs. Resize, script reload and
context restoration reset the appropriate resources. Up to 32 filter calls run
per frame; surfaces are limited to 16,777,216 pixels and hardware texture limits.
Filtered 2D now requires WebGL2, as 3D and scramble already did.

Capture reuses one detached GPU context for filtered 2D and 3D. It rerenders a
fresh 1280×720 frame without lifecycle hooks or mutations to live properties.
Accumulated drawing and scramble history are still excluded, as before this
change. Filtered pixels are synchronously copied onto the opaque PNG surface
before asynchronous encoding. Future canvas recording can consume the filtered
output directly; video encoding, audio muxing and offline frame timing are out
of scope.

## Verification

- Native tests cover typed filter order, defaults, clamping, finite values,
  execution limits, capability detection and degree/radian agreement.
- `tests/browser/filters.html` compares live and capture pixels for all nine
  filters in both contexts, alpha, ordering, blur, overlays, accumulation,
  feedback isolation, resize, stable resource reuse and context restoration.
- `tests/browser/capture.html` checks PNG output, models, capture state isolation,
  repeated context reuse and capture context loss.
- The validator scramble suite compares original presets and tests moving scenes,
  refresh timing, depth, lifecycle and GPU behaviour. Its transparent-alpha branch
  was updated from the former transparency convention to `a: 0.0`, and a
  remaining depth-test sprite uses the current `width`/`height` names.

Pixel checks run in Chromium. Cross-browser visual review and real-device
performance remain useful release checks; these tests do not establish a mobile
frame-rate guarantee.
