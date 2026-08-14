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
- Properties can be read in `layer_2d` blocks
- Properties retain their values between frames

## Usage

```
prop x = 100.0

on_frame {
  x = x + 1.0    // Update each frame
}

layer_2d {
  draw::circle(x: x, y: 300.0, radius: 20.0, color: $COLOR_RED)
}
```

Properties are the primary way to create animation. The `on_frame` block runs before each render, allowing you to update state that the `layer_2d` block then uses for drawing.
