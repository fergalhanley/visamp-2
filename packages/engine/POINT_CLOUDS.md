# Procedural point clouds

Available in compiler **2.3.0**, under `context 3d`.

```vdsl
context 3d
render {
  let audio = $FREQUENCY_DATA
  draw::point_cloud(
    count: 147456,
    x: ($POINT_INDEX % 384) / 38.4 - 5.0,
    y: audio[$POINT_INDEX % 384] / 255.0,
    z: math::floor(value: $POINT_INDEX / 384.0) / 38.4 - 5.0,
    color: color::hsl(h: $POINT_INDEX / $POINT_COUNT, s: 1.0, l: 0.5),
    size: 2.0
  )
}
```

One call draws `count` square points in one native `GL_POINTS` draw, without
constructing meshes or running the interpreter once per point. The renderer
compiles position/colour expressions to a bounded vertex shader. It caches that
program while referenced; changing frame values uploads data without recompiling.
No author-provided shader source is accepted.

## Arguments

| Argument | Meaning | Default |
| --- | --- | --- |
| `count` | Whole number of points, 0–1,000,000 | Required |
| `x`, `y`, `z` | Per-point coordinates inside the current transform | 0 |
| `color` | Constant colour or per-point `color::rgb` / `color::hsl` | White |
| `size` | Nonnegative point size | 2 |
| `size_attenuation` | Scale size with perspective distance | false |

`$POINT_INDEX` is zero-based; `$POINT_COUNT` is the cloud's count. They are only
available directly inside `x`, `y`, `z` and `color` expressions. A `let` outside
these expressions is a frame value, not a per-point formula.

Subexpressions independent of these two values are evaluated once per cloud per
frame by the interpreter. This includes time, audio, properties, array bindings
and user functions. Per-point expressions support numeric unary `+`/`-`,
arithmetic `+ - * / \ %`, the existing `math::` functions, and indexed reads
from a frame's numeric array or audio bytes. They do not support per-point user
function calls, booleans, comparisons, bitwise operators, or gradients. Move
those calculations into ordinary DSL statements before the draw.

GPU arithmetic uses 32-bit floats, including indices and truncating division;
it does not preserve the interpreter's integer type. `%` is nonnegative modulo.
Invalid array indices (negative, fractional, nonfinite or out of bounds) read
as zero. Array inputs and scalar snapshots must be finite and representable as
32-bit floats. Use valid domains for maths (for example, positive logarithm
inputs and nonnegative bases for `pow`); GPU results outside those domains are
not portable. Points whose final clip position or colour is nonfinite are
culled. RGB and transparency are clamped to 0–1; HSL uses hue in turns and
clamps saturation/lightness to 0–1.

## Rendering and limits

Points use the current camera, transform stack, depth settings and blend mode.
They are unlit and retain command order alongside meshes and sprites. They do
not take mesh arguments such as texture, normals, wireframe, rotation or opacity;
use the transform stack for placement and `color` transparency for alpha.
Face culling has no effect on points.

With attenuation disabled, size is in drawing-buffer pixels. With attenuation
enabled under a perspective camera, pixel size is
`size * viewport_height / (2 * distance_along_camera_forward)`; object scaling
does not scale size. Orthographic cameras keep pixel sizing. Zero size draws
nothing. Positive sizes are clamped to the device's supported
[`ALIASED_POINT_SIZE_RANGE`](https://registry.khronos.org/webgl/specs/latest/1.0/).

Per frame: at most **1,000,000 points**, **64 clouds** and **1,000,000 uploaded
numbers**. Each cloud accepts at most **32,768 uploaded numbers**; expression
traversals are limited to 512 nodes and 128 levels of nesting. Exceeding these
limits reports a runtime error at the draw statement. Clouds also count toward
the existing 8,192 draw-command budget and consume no triangle budget. These
limits bound input and allocation size; actual speed still depends on shader
complexity, point size/overdraw and the device.

## Browser regression checks

Build with `pnpm --filter @visamp/engine build:validator`, serve the
`packages/engine` directory over HTTP, and open
`tests/browser/point-clouds.html`. Its result is also available as
`window.results`. These checks sample rendered pixels for mixed primitives,
depth, alpha, HSL, array reads, transforms and invalid positions; they verify a
147,456-point draw and shader reuse across audio/time updates.
