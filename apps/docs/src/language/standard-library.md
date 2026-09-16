# Standard library map

Visript uses namespaces to group related operations. Calls use named arguments,
for example `draw::circle(x: 100, y: 100, radius: 30)`. This map points to the
parameter tables and examples; individual pages describe context restrictions.

| Task | Namespace | Reference |
| --- | --- | --- |
| Shapes, text, images, point clouds | `draw::` | [Primitives](../drawing/primitives.md), [creative tools](../drawing/creative-tools.md) |
| Transforms | `transform::` | [Creative tools](../drawing/creative-tools.md) |
| Camera and lighting | `camera::`, `light::` | [3D mode](../3d/overview.md) |
| Blending, clearing and overlays | `gfx::` | [Creative tools](../drawing/creative-tools.md) |
| Bitmaps and model positions | `asset::` | [Assets](../3d/assets.md) |
| Construct colours | `color::` | [Colour constructors](../drawing/color-constructors.md) |
| Geometry, distortion, pixelation and bloom | `effect::` | [Whole-frame effects](../effects/frame-effects.md) |
| Colour adjustment and blur | `effect::filter::` | [Canvas filters](../effects/filters.md) |
| Feedback and tile rearrangement | `effect::scramble()` | [Scramble](../effects/scramble.md) |
| Numbers, trigonometry and interpolation | `math::` | [Math library](../programming/math.md) |
| Audio levels, frequency data and attacks | `audio::detect::` | [Audio detection](../programming/audio-detection.md) |
| Pointer and keyboard state/events | `input::` | [Input detection](../programming/input-detection.md) |

Read [Language Conventions](conventions.md) for coordinate systems, units,
colour alpha and argument naming.
