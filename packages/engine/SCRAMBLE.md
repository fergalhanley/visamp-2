# Scramble implementation and verification — VIS-71

Issue: <https://linear.app/visamp/issue/VIS-71/create-scramble-filter-in-dsl>.
DSL support is included in compiler version 2.2.0.

## Rendering

Scripts containing a scramble call use a shared WebGL2 compositor. Canvas2D
draws into a separate scene canvas, transferred directly to the scene texture.
The 3D renderer draws into a scene framebuffer with a fresh depth buffer. The
compositor refreshes retained history, composites the scene, scrambles the
combined image, and presents it. Read and write history targets alternate;
no draw samples its own destination texture.

Scene and history textures store premultiplied RGBA8. The intermediate
composition texture contains straight RGBA8, matching the byte layout exposed
by Canvas2D `getImageData`. The shader explicitly translates between top-left
Canvas addresses and bottom-left GL texels. Sampling is nearest-neighbour, and
composition uses sRGB byte values rather than introducing a linear-light
conversion. Original offsets can select alpha or cross channel, pixel and row
boundaries. Out-of-range byte reads produce zero, as in the reference's clamped
typed array.

For widths of at least 27 pixels, every original source read precedes any write
to that source, so independent shader sampling is equivalent. Smaller widths
use a source-address map that resolves the sequential dependencies once per
preset/size change. The map contains addresses, never captured image pixels.

Types 18–40 sample the whole image with clamped nearest-neighbour coordinates.
The additional types 21–40 cover colour separation/cycling, waves, zooms, swirls,
radial distortions, tile transforms and deterministic glitches. They share the
same compositor and history in both contexts. Coordinates use the image centre
for zoom/lens effects and fixed pixel sizes for waves/tiles; they do not depend
on random state or time. The user-facing mapping is in the
[scramble reference](../../apps/docs/src/effects/scramble.md).

Refresh uses the reference's 8-bit source-over rounding, including its
[256-based destination scale](https://api.skia.org/SkColorPriv_8h_source.html).
Doing that rounding at the display frame rate would change fade duration.
Instead, elapsed time accumulates into 60 Hz refresh steps with the fractional
remainder retained. This refines the original exponential-alpha plan to preserve
byte rounding: high frame rates draw between refresh steps and low frame rates
apply multiple steps. Opaque refresh replaces history every render, regardless
of step count. After a long pause, at most 256 steps are needed because the
8-bit transition is monotonic and reaches a fixed point. Scramble displacement
still runs per rendered frame.

Explicit background/clear colours belong to the current scene, so an opaque
one hides trails. Existing CSS filters apply after presentation and do not enter
history. A missing scramble call displays the current scene and invalidates
history. Reload, resize, re-enable and restored contexts reset history. Rust
ownership deletes framebuffer, renderbuffer and texture resources when replaced
or dropped. Scripts without scramble retain their existing backend.

## Reproducible checks

`tests/fixtures/shiftFilter.ts` is the unchanged 1,881-byte original from the
adjacent Visamp checkout. The issue's attachment had an expired/inaccessible
signed URL; Fergal approved using the local original. The browser harness strips
only its two TypeScript parameter annotations to execute it as the reference.

Run the commands in [README.md](README.md). The browser checks use Playwright
Chromium and write comparison images and JSON results under `/tmp/vis71-results`.
Set `PORT=0` to choose an available port. Use `--benchmark` to run just the
performance checks, or `--serve` for interactive examples with context, preset
and refresh controls.

Verified on 2026-09-10:

- All 17 original presets at widths 128, 26, 8 and 1: **exact** first-frame
  equality (68 comparisons), including boundaries and channel addressing.
- Eight accumulating frames for each original preset: maximum **1/255** colour
  difference, identical alpha. The single-level tolerance covers conversion
  rounding; no displacement or preset differences are allowed.
- 1,600 moving-scene comparisons across 40 presets and five refresh settings:
  exact Canvas2D rectangle and 3D sprite output. Another 32 comparisons cover
  translucent scene geometry.
- All 20 new presets (21–40) produce distinct, non-identity output on an
  asymmetric colour grid at 128×80 and 129×81. Repeated loads are deterministic
  and opaque edges remain valid at those sizes plus 7×5 and 1×1 (80 cases).
  See `new-presets.png` in the results directory for input/effect comparisons.
- Omitted/opaque, translucent black, translucent blue and fully transparent
  refresh at 30/60/120 FPS; current-frame depth; effect disable/re-enable;
  visual reload; resize; actual `WEBGL_lose_context` loss/restoration.
- Native tests for DSL values/errors, nested call detection, sequential source
  maps, refresh cadence and the documented examples.

The reference images use integer-aligned shapes to distinguish effect errors
from expected differences in scene rasterisation. Browser-specific antialiasing
and colour conversion can still differ for other geometry and images.

## Fullscreen performance

1920×1080, preset 3, translucent black refresh, ten warm-up frames and sixty
measured frames per context. The available Chromium instance reported **ANGLE
SwiftShader software rendering**, even though the host identifies as Apple M5
Pro. These are software-renderer measurements, not native-GPU FPS claims.

| Context | Median frame latency | P95 |
|---|---:|---:|
| 2D moving circle | 40.1 ms | 41.7 ms |
| 3D moving cube and sphere | 40.6 ms | 43.9 ms |

These latest measurements include the shader with all 40 presets. The earlier
20-preset version measured approximately 30–31 ms median on this software
renderer; native GPU performance still needs local assessment.

Timing waits for a GPU fence and includes timer-polling overhead; it measures
completed frames rather than only command submission. Instrumentation recorded
**zero production `getImageData`/`readPixels` calls** during these frames. Pixel
readbacks exist only in the verification harness. Native GPU and lower-powered
physical-device measurements were unavailable; those remain useful local checks.
