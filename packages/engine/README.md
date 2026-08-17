# @visamp/engine

The Visamp DSL — parser, interpreter and canvas renderer — written in Rust and
compiled to WebAssembly with `wasm-pack`.

## Layout

| Path                | Purpose                                        |
| ------------------- | ---------------------------------------------- |
| `src/parser.rs`     | pest-based parser for the DSL                  |
| `src/model.rs`      | AST / runtime value model                      |
| `src/interpreter.rs`| Evaluates a script and drives the canvas       |
| `src/lib.rs`        | `wasm-bindgen` boundary exposed to JavaScript  |
| `visamp_dsl.pest`   | Grammar                                        |
| `pkg/`              | Build output (gitignored)                      |

## Build

```bash
pnpm --filter @visamp/engine build   # or: turbo run build --filter=@visamp/engine
```

This runs `build-wasm.sh`, which calls `wasm-pack build --target bundler --out-dir pkg`
and then optimises the `.wasm` with `wasm-opt` if Binaryen is installed.

Consumers import the package by name; `exports` maps to the `pkg/` output:

```js
import init, { load_script } from "@visamp/engine";
```

## Requirements

- Rust toolchain with the `wasm32-unknown-unknown` target
- [`wasm-pack`](https://rustwasm.github.io/wasm-pack/)
- Optional: [Binaryen](https://github.com/WebAssembly/binaryen) for `wasm-opt`
