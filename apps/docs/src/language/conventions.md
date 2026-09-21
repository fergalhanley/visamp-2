# Language conventions

Visript is the language; `.viscript` is its standard source extension.

## Names and calls

Use `snake_case` for functions, parameters, properties and local variables, and
`$UPPER_SNAKE_CASE` for system values. Calls use named arguments, for example
`draw::circle(x: 100, y: 100, radius: 30)`. User-defined function parameters need
defaults; some built-in parameters are required.

Namespaces group related operations. See the [standard library map](standard-library.md).

## Units and coordinates

2D uses pixels with the origin at the top left; X increases right and Y down.
3D uses world coordinates and a camera. Each function documents its pivot and
coordinate system. Use full dimension names such as `width`, `height` and `depth`.

Angles use `rad` or `deg`, or a descriptive name such as `rotation_y_deg`.
Supply only one unit for each angle. Trigonometric inputs use `rad`; inverse
trigonometric functions return radians. HSL hue uses normalized turns.

## Colour and strokes

Colour constructors use `a` for alpha: 0 is transparent, 1 is opaque, and the
default is 1. Replace the old `transparent` argument with `a: 1.0 - (old_value)`.
Shape opacity and filter amounts are separate controls. Outline thickness uses
`stroke_width`.

## Integers and floats

Whole-number arguments, counts, range bounds/steps and array indices implicitly
floor finite floats: `3.9` becomes `3`, while `-0.2` becomes `-1`. Bounds and
resource limits apply after conversion. Non-numeric, non-finite and integer-overflow
values are errors. Ordinary arithmetic retains its existing types: `math::floor` returns a float, while integer
division (`\`) returns an integer. See [Control Flow](../programming/control-flow.md).

## Input state and events

`input::<device>::state` reads persistent state. `input::<device>::event` reads
the current matching event. Getters use `get_` for values and `is_` for booleans.
Event values are available only while handling their event. See
[Input Detection](../programming/input-detection.md).
