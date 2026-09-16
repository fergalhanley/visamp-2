# Properties

Properties define mutable state that persists across frames. They are declared at the top level of your script.

## Syntax

```
prop <name> = <value>
```

## Examples

```
prop angle = 0.0
prop count = 10
prop name = "hello"
prop visible = true
prop points = [[100.0, 200.0], [300.0, 400.0]]
```

## Rules

- Properties must be declared before any blocks
- Each property name must be unique
- Properties can be read and written in `on_frame` blocks
- Properties can be read in `render` blocks
- Properties retain their values between frames

## Usage

```
prop x = 100.0

on_frame {
  x = x + 1.0    // Update each frame
}

render {
  draw::circle(x: x, y: 300.0, radius: 20.0, color: $COLOR_RED)
}
```

Properties are the primary way to create animation. The `on_frame` block runs before each render, allowing you to update state that the `render` block then uses for drawing.

## Array state

As of engine 2.4.0, an array property can start empty and be initialized in
`on_init`. Indexed writes then update existing elements across frames:

```visript
prop bands = []

on_init {
  bands = array::filled(count: 384, value: -1)
}

on_frame {
  let audio = audio::detect::get_spectrum()
  for i in 0..384 {
    if audio[i] > 0 {
      bands[i] = audio[i]
    }
  }
}
```

This keeps the last nonzero sample in each bin. `on_init` resets the array when
a script is loaded; `on_frame` updates it before rendering. Point-cloud fields
can read `bands[$POINT_INDEX % 384]` directly.

Literal properties also support empty and nested arrays, for example
`prop points = [[0.0, 1.0], [2.0, 3.0]]`.
See [arrays](expressions.md#creating-and-updating-arrays) for limits and assignment rules.
