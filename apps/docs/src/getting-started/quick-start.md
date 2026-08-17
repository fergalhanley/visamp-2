# Quick Start

## Running Visamp

```sh
# Install dependencies
npm install

# Build WASM + JS bundle
npm run build

# Start dev server
npm start
```

Open `http://localhost:8080` in your browser.

## Editor Layout

The interface has two panels:

- **Left**: Code editor - write your DSL code here
- **Right**: Canvas - see your graphics rendered live
- **Bottom right**: Error bar - shows parse and runtime errors

Changes to the code are reflected on the canvas automatically (with a 300ms debounce).

## Minimal Example

```
layer_2d {
  draw::background(color: $COLOR_BLACK)
  draw::circle(x: 400.0, y: 300.0, radius: 50.0, color: $COLOR_RED)
}
```

This draws a red circle on a black background. That's it!

## Building for Production

```sh
npm run build
```

The output is in `dist/` - a self-contained static site you can deploy anywhere.
