# Visript

Visript is VisAmp’s visualisation language for creative coding in the browser. Write declarative code to create audio-reactive graphics using Canvas 2D and WebGL 3D.

## What is Visript?

Visript is a domain-specific language designed for creating animated visual art. It combines the simplicity of declarative graphics with the power of a full programming language.

## Names and source files

**Visript** is the language; **VisAmp** is the application that hosts it.
Use `.viscript` for source files and `visript` for Markdown code fences.
Existing `.vdsl` files remain supported. The syntax and stored
visualisations are unchanged by the naming update.

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
visript.pest (grammar) → parser → AST → interpreter → Canvas 2D / WebGL 3D
```

The entire language runs as WebAssembly in your browser. There is no server, no build step for your scripts - just write code and see it render.

## Who is this for?

- Creative coders who want a simple, focused language
- Artists exploring generative art
- Educators teaching programming concepts through visuals
- Anyone who wants to make animated graphics without complex setup
