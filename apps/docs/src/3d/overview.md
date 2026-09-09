# 3D Mode

Adding `context 3d` switches the coordinate model from flat pixels to world
space, and unlocks a camera, a transform stack, lights and solid primitives.

> **Partly renderable.** The solid primitives below — `cube`, `sphere`, `plane`,
> `cylinder`, `cone`, `torus`, `sprite`, `mesh` and `model` — render through the
> WebGL2 renderer, with lights, the transform stack and textures. The 2D
> primitives promoted into 3D (`rect`, `circle`, `line`, `polygon`, `text`)
> still parse and type-check but report `is not rendered in 3d mode yet` at run
> time. Expect those pictures to arrive, not the syntax to change.

```
context 3d

render {
  draw::cube()
}
```

A bare `draw::cube()` is visible with no camera setup — every primitive is
unit-sized at the origin by default, and there is a sensible default camera.

## Coordinate system

| Property | Value |
|---|---|
| Handedness | Right-handed |
| Up axis | `+Y` |
| Into the screen | `−Z` |
| Units | Arbitrary world units, not pixels |
| Origin | Centre of the view |

A 2D sketch's `x`/`y` map straight onto the `z = 0` plane, so porting one is
mostly a matter of scale.

**Aspect ratio is never set in script.** The runtime derives it from the canvas.
Your script has to look right at any viewport size — the same discipline the
[canvas-relative sizing](../programming/system-values.md) advice asks for in 2D.

## Angles: always say the unit

Every angle argument names its unit. Both spellings work everywhere:

```
transform::rotate_y(deg: $TIME_SEC * 30.0)
transform::rotate_y(rad: $TIME_SEC * 0.52)
```

Where a call takes several angles, the unit suffixes each name:

```
camera::orbit(yaw_deg: $TIME_SEC * 20.0, pitch_deg: 15.0)
camera::orbit(yaw_rad: $TIME_SEC * 0.35, pitch_rad: 0.26)
```

Giving both units for the same angle is an error — there is no sensible way to
reconcile them, and silently preferring one would make the other look like it
worked:

```
transform::rotate_y(deg: 90.0, rad: 1.57)
// error: transform::rotate_y: specify deg or rad, not both
```

## `camera::`

Camera state resets to the default at the start of every `render` block. Later
calls override earlier ones.

| Call | Arguments | Defaults |
|---|---|---|
| `camera::perspective` | `fov_deg` / `fov_rad`, `near`, `far` | 60°, 0.1, 500 |
| `camera::orthographic` | `height`, `near`, `far` | 10, 0.1, 500 |
| `camera::position` | `x`, `y`, `z` | 0, 0, 10 |
| `camera::look_at` | `x`, `y`, `z` | 0, 0, 0 |
| `camera::direction` | `x`, `y`, `z` | 0, 0, −1 |
| `camera::up` | `x`, `y`, `z` | 0, 1, 0 |
| `camera::orbit` | `target_x`, `target_y`, `target_z`, `distance`, `yaw_deg`/`yaw_rad`, `pitch_deg`/`pitch_rad` | 0, 0, 0, 10, 0, 0 |

`fov_deg` is the **vertical** field of view.

`look_at` and `direction` are two ways of saying the same thing — the last call
wins, and mixing them is not an error. `camera::orbit` is sugar that sets
position and orientation together; a later `camera::position` overrides the
position it worked out.

The default camera is perspective, 60° vertical, at `(0, 0, 10)`, looking at the
origin.

## `transform::`

A matrix stack, reset to a single identity at the start of every `render` block.

| Call | Arguments |
|---|---|
| `transform::push` | — |
| `transform::pop` | — |
| `transform::identity` | — resets the current matrix |
| `transform::translate` | `x`, `y`, `z` (default 0) |
| `transform::rotate_x` | `deg` / `rad` |
| `transform::rotate_y` | `deg` / `rad` |
| `transform::rotate_z` | `deg` / `rad` |
| `transform::scale` | `x`, `y`, `z` (default 1), or `all` for uniform |

Transforms apply to **every** draw call, including the 2D primitives.

```
context 3d

render {
  for i in 0..12 {
    transform::push()
    transform::rotate_y(deg: i * 30.0)
    draw::cube(x: 4.0, w: 0.3, h: 1.0, d: 0.3)
    transform::pop()
  }
}
```

Popping an empty stack is an error, and so is leaving a `render` block with the
stack unbalanced — state must not leak into the next frame. Maximum depth 64.

## `light::`

Lights are additive and reset every frame.

| Call | Arguments | Defaults |
|---|---|---|
| `light::ambient` | `color` | black |
| `light::directional` | `x`, `y`, `z` (direction), `color`, `intensity` | 0/−1/0, white, 1.0 |
| `light::point` | `x`, `y`, `z`, `color`, `intensity`, `range` | 0/0/0, white, 1.0, 50 |

At most 8 directional and 16 point lights per frame. Going over is a warning in
the log, not an error — a visualisation adding lights in a loop should degrade,
not die.

**Lights must be declared before the draws they affect.** Shading defaults to
`lambert` if any `light::` call has been made *earlier in the current frame*,
and `unlit` otherwise, and that is decided at the moment of each draw.

## `draw::` — 3D primitives

All unit-sized at the origin, so a bare call renders something.

| Call | Arguments | Defaults |
|---|---|---|
| `draw::cube` | `size`, or `w`, `h`, `d` | 1 |
| `draw::sphere` | `radius`, `resolution` | 0.5, 24 |
| `draw::plane` | `w`, `d`, `subdivisions` | 1, 1, 1 |
| `draw::cylinder` | `radius`, `height`, `segments` | 0.5, 1, 32 |
| `draw::cone` | `radius`, `height`, `segments` | 0.5, 1, 32 |
| `draw::torus` | `radius`, `tube`, `segments`, `tube_segments` | 0.5, 0.15, 32, 16 |
| `draw::sprite` | `size`, or `w`, `h` — always camera-facing | 1 |
| `draw::mesh` | `vertices` **(required)**, `indices`, `normals`, `uvs` | — |
| `draw::model` | `asset` **(required)** — an `asset::model` reference | — |

`draw::plane` lies in the XZ plane facing `+Y` — a floor.

`draw::sprite` is the particle workhorse: a quad that always faces the camera.

`draw::mesh` takes nested arrays. Without `indices` the vertices are read as a
triangle list; without `normals` they are computed per face. Capped at 65536
vertices per call.

```
draw::mesh(
  vertices: [[0.0, 0.0, 0.0], [1.0, 0.0, 0.0], [0.0, 1.0, 0.0]]
)
```

`draw::model` draws geometry from an uploaded model instead of an inline array.
It is a separate call rather than an argument on `draw::mesh` so that one keeps
its "vertices are required" guarantee. See [Assets](./assets.md).

```
draw::model(asset: asset::model("a1b2c3d4-…"))
```

## `draw::` — the 2D primitives in 3D

They stay legal and are promoted into world space, gaining `z` and the rotation
arguments. `draw::rect(x: 0.0, y: 0.0, w: 2.0, h: 1.0)` is a flat quad on the
`z = 0` plane, which is what porting a 2D sketch should look like — and a floor
needs no new builtin:

```
context 3d

render {
  transform::rotate_x(deg: 90.0)
  draw::rect(x: 0.0, y: 0.0, w: 20.0, h: 20.0)
}
```

None of these are rendered yet — they compile, and then report
`is not rendered in 3d mode yet` at run time. The rest of this section describes
the intended behaviour.

**`draw::line` is the one call whose argument changes meaning between modes.**
It gains `z1` and `z2`, and its `stroke_weight` is read as **screen pixels in
2d and world units in 3d**, so lines recede correctly with perspective.

## Arguments every `draw::` call takes in 3D

| Argument | Meaning | Default |
|---|---|---|
| `rot_x`, `rot_y`, `rot_z` | Per-primitive rotation in degrees (`rot_x_rad` etc. also accepted) | 0 |
| `color` | A `color::` expression | white |
| `shading` | `"unlit"`, `"flat"` or `"lambert"` | see `light::` above |
| `wireframe` | boolean | `false` |
| `opacity` | 0.0–1.0 | 1.0 |
| `texture` | An `asset::bitmap` or `asset::vector` reference — see [Assets](./assets.md) | none |

The 3D primitives are additionally positioned with `x`, `y`, `z`, applied before
the transform stack. The 2D primitives keep their own positioning arguments and
gain `z`.

## `gfx::` — render state

Per-frame, reset at the start of every `render` block.

| Call | Arguments | Default |
|---|---|---|
| `gfx::depth` | `enabled`, `write` | `true`, `true` |
| `gfx::blend` | `mode`: `"alpha"`, `"additive"`, `"multiply"`, `"none"` | `"alpha"` |
| `gfx::cull` | `mode`: `"none"`, `"back"`, `"front"` | `"none"` |
| `gfx::clear` | `color` | transparent |
| `gfx::overlay` | `enabled` | `false` |

Culling defaults to `none` on purpose: drawing a plane and looking at it from
below should show you the plane, not a debugging session.

Additive blending with depth writes off is the most common setup for music
visualisation:

```
gfx::blend(mode: "additive")
gfx::depth(enabled: true, write: false)
```

### Overlay: back to screen space

`gfx::overlay(enabled: true)` switches to screen space for titles, meters and
vignettes. Inside the bracket, 2D primitives behave exactly as they do in
`context 2d` — pixel coordinates, no depth test, drawn on top of all 3D
geometry — and the transform stack is bypassed.

```
gfx::overlay(enabled: true)
draw::text(content: "spectrum city", x: 20.0, y: 40.0, size: 24.0, color: $COLOR_WHITE)
gfx::overlay(enabled: false)
```

Any 3D call inside the bracket is an error, since none of it means anything in
screen space.

## What is legal where

| Call group | `context 2d` | `context 3d` | inside `gfx::overlay` |
|---|---|---|---|
| 2D `draw::` set | ✓ | ✓ world space, `z`/`rot_*` legal | ✓ screen space |
| 3D `draw::` set | error | ✓ | error |
| `camera::` | error | ✓ | error |
| `transform::` | error | ✓ | error |
| `light::` | error | ✓ | error |
| `gfx::depth`/`blend`/`cull`/`clear` | error | ✓ | ignored |
| `gfx::overlay` | error | ✓ | idempotent |
| `math::`, `color::`, your own `fn` | ✓ | ✓ | ✓ |

Everything in this table is checked when the script compiles, before a single
frame runs, so a mistake shows up as a squiggle in the editor rather than a
blank canvas.

One limit worth knowing: overlay is tracked as straight-line state. If you turn
it on inside an `if` or a `for`, the checker cannot know whether it is on
afterwards without running your script, so it stops reporting rather than
guessing at an error you may not have.

## Limits

Enforced by the runtime, so a heavy script degrades instead of dying:

| Limit | Value |
|---|---|
| Draw commands per frame | 8192 |
| Triangles per frame | 2,000,000 |
| Mesh vertices per call | 65536 |
| Transform stack depth | 64 |
| Directional / point lights | 8 / 16 |

Going past the per-frame draw or triangle limit drops the rest of that frame's
commands and warns in the log.

## Not yet

Materials beyond a colour and a single texture, shadows, post-processing (bloom
is the obvious first want for additive work), spot lights and camera paths are
all out of scope for now. So are the 2D primitives under `context 3d`, which
compile but do not draw.

Textures have arrived: every primitive carries texture coordinates and
`draw::mesh(uvs:)` is now used rather than merely accepted. See
[Assets](./assets.md).
