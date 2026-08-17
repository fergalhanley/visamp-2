# Visamp DSL

Visamp is a visual programming DSL for creative coding in the browser. Write simple declarative code to create animated graphics using Canvas 2D.

## What is Visamp?

Visamp (Visual Amp) is a domain-specific language designed for creating animated visual art. It combines the simplicity of declarative graphics with the power of a full programming language.

## Key Features

- **Simple syntax** - Easy to learn, focused on visual output
- **Live preview** - See changes instantly as you type
- **Animation** - Built-in frame loop for smooth animations
- **Drawing primitives** - Circles, rectangles, polygons, lines, ellipses, text
- **Color system** - 32 named colors plus RGB/HSL constructors
- **Control flow** - If/else, for loops, while loops
- **Functions** - Define reusable drawing routines
- **System values** - Access time, mouse position, canvas dimensions

## Architecture

```
visamp_dsl.pest (grammar) → parser → AST → interpreter → Canvas 2D
```

The entire language runs as WebAssembly in your browser. There is no server, no build step for your scripts - just write code and see it render.

## Who is this for?

- Creative coders who want a simple, focused language
- Artists exploring generative art
- Educators teaching programming concepts through visuals
- Anyone who wants to make animated graphics without complex setup
