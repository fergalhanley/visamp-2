# Rendering context

Choose the coordinate system once per script:

```visript
context 3d
render {
  draw::cube(rotation_y_deg: $TIME_SEC * 20, color: $COLOR_CORAL)
}
```

`context 2d` is the default when the declaration is omitted. Both modes are
implemented. A context declaration is top-level and can appear before or after
properties/functions; convention puts it first. Declaring it twice is an error.

## What changes

| | 2D | 3D |
| --- | --- | --- |
| Coordinates | Pixels, origin top-left, +Y down | World units, origin at world centre, +Y up |
| Drawing | Shapes, paths, text, images | Solids, planar shapes, strokes, points, grids, models |
| Camera/lights | Not used | `camera::` and `light::` |
| Previous frame | Retained unless cleared | Scene rebuilt each frame; use scramble for feedback |
| Text/images | Canvas coordinates | Final screen-space overlay |
| Full-frame effects | GPU post-processing | Same GPU post-processing |

Math, properties, arrays, functions, audio and input are shared. Some transform
and blend calls work in both modes; others require 3D. Check the
[availability table](../drawing/creative-tools.md#availability) before moving a
2D sketch into world space. In particular, text and image drawing need
`gfx::overlay(enabled: true)` in a 3D script.

The host recreates the canvas when switching between 2D and 3D scripts, or when
adding/removing GPU post-processing. You can change `context` in the editor;
it is not a permanent choice for the whole browser session.

3D, scramble, filters and whole-frame effects require WebGL2. Plain 2D uses
Canvas 2D. Backend selection is automatic—there is no backend declaration.

See [3D Mode](../3d/overview.md) for camera, lighting, geometry and point fields.
