# Visamp 2

A visual programming DSL for creative coding in the browser. Write simple declarative code to create animated graphics using Canvas 2D.

## Quick Start

```sh
npm install
npm run build
npm start
```

Open `http://localhost:8080` in your browser.

## Language Reference

### Properties

Define mutable state with `prop`:

```
prop angle = 0.0
prop count = 10
```

### Event Blocks

`on_frame` runs every frame to update state:

```
on_frame {
  angle = $TIME_SEC
}
```

### Layer Blocks

`layer_2d` renders graphics each frame:

```
layer_2d {
  draw::background(color: $BLACK)
  draw::circle(x: 400.0, y: 300.0, radius: 50.0, color: $RED)
}
```

### Drawing Primitives

| Command | Parameters |
|---------|-----------|
| `draw::background` | `color` |
| `draw::circle` | `x`, `y`, `radius`, `color`, `stroke`, `stroke_weight`, `stroke_color` |
| `draw::rect` | `x`, `y`, `width`, `height`, `color`, `stroke`, `stroke_weight`, `stroke_color`, `rotate` |
| `draw::polygon` | `points`, `color`, `rotate` |
| `draw::line` | `x1`, `y1`, `x2`, `y2`, `color`, `stroke_weight` |
| `draw::ellipse` | `x`, `y`, `rx`, `ry`, `color`, `stroke`, `stroke_weight`, `stroke_color`, `rotate` |
| `draw::text` | `content`, `x`, `y`, `size`, `color`, `font` |

### System Values

| Value | Description |
|-------|-------------|
| `$TIME_SEC` | Elapsed time in seconds |
| `$TIME_MS` | Elapsed time in milliseconds |
| `$WIDTH` | Canvas width |
| `$HEIGHT` | Canvas height |
| `$MOUSE_X` | Mouse X position |
| `$MOUSE_Y` | Mouse Y position |
| `$FRAME_COUNT` | Current frame number |

### Color Constants (32)

`$COLOR_BLACK`, `$COLOR_WHITE`, `$COLOR_RED`, `$COLOR_GREEN`, `$COLOR_BLUE`,
`$COLOR_ORANGE`, `$COLOR_YELLOW`, `$COLOR_PINK`, `$COLOR_MAGENTA`, `$COLOR_CYAN`,
`$COLOR_TEAL`, `$COLOR_TURQUOISE`, `$COLOR_NAVY`, `$COLOR_INDIGO`, `$COLOR_VIOLET`,
`$COLOR_PURPLE`, `$COLOR_LAVENDER`, `$COLOR_BROWN`, `$COLOR_MAROON`, `$COLOR_OLIVE`,
`$COLOR_FOREST_GREEN`, `$COLOR_GOLD`, `$COLOR_SILVER`, `$COLOR_GRAY`, `$COLOR_DARK_GRAY`,
`$COLOR_LIGHT_GRAY`, `$COLOR_CRIMSON`, `$COLOR_CORAL`, `$COLOR_SALMON`, `$COLOR_SAND`,
`$COLOR_BEIGE`, `$COLOR_SKY_BLUE`, `$COLOR_AMBER`, `$COLOR_LIME`, `$COLOR_CHARTREUSE`, `$COLOR_TAN`

### Color Constructors

```
color::rgb(red: 1.0, green: 0.5, blue: 0.0, transparent: 0.2)
color::hsl(hue: 0.5, saturation: 0.8, lightness: 0.5)
```
All params optional, default to 0.0. `transparent` is 0.0 (opaque) to 1.0 (fully transparent).

### Control Flow

```
if x > 10 {
  draw::circle(x: 100.0, y: 100.0, radius: 20.0, color: $RED)
} else {
  draw::circle(x: 100.0, y: 100.0, radius: 20.0, color: $BLUE)
}

for i in [1, 2, 3, 4, 5] {
  draw::circle(x: i * 100.0, y: 300.0, radius: 20.0, color: $GREEN)
}

while x < 100 {
  x = x + 1
}
```

### Functions

```
fn dot(px, py, col) {
  draw::circle(x: px, y: py, radius: 10.0, color: col)
}

layer_2d {
  dot(100.0, 200.0, $RED)
  dot(300.0, 200.0, $BLUE)
}
```

### Expressions

Full expression support: arithmetic (`+`, `-`, `*`, `/`, `%`), comparison (`==`, `!=`, `<`, `>`, `<=`, `>=`), boolean logic (`!`), arrays, and string literals.

## Architecture

```
visamp_dsl.pest (grammar) → parser.rs → model.rs (AST) → interpreter.rs → Canvas 2D
```

- **Parser**: Pest-based parser generates AST from DSL source
- **Model**: AST types and scoped variable storage
- **Interpreter**: Walks AST, executes draw commands via `web_sys` Canvas 2D API
- **WASM**: Compiled to WebAssembly, runs entirely in the browser

## Build

```sh
# Build WASM + JS bundle
npm run build

# Dev server with hot reload
npm start
```

## License

MIT
