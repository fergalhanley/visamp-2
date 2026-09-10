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
| `src/scramble.rs`   | Scramble presets, timing and backend selection |
| `src/feedback.rs`   | Shared 2D/3D GPU feedback and resource ownership |
| `src/scramble.frag` | Composition, byte-addressed scramble and presentation |
| `visamp_dsl.pest`   | Grammar                                        |
| `pkg/`              | Build output (gitignored)                      |

## Build

```bash
pnpm --filter @visamp/engine build   # or: turbo run build --filter=@visamp/engine
```

The same crate also exposes the native validator used by server-side code:

```bash
cargo build --release --bin visamp-validate
target/release/visamp-validate path/to/script.vdsl
cat path/to/script.vdsl | target/release/visamp-validate
```

Validation exits `0` and prints `OK` on success, or exits `1` and writes the
same positioned diagnostic used by the browser compiler. Run
`pnpm --filter @visamp/engine check:parity` to build both targets and verify
their recorded versions match.

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

## Scramble verification

See [the implementation and verification notes](SCRAMBLE.md) and the
[DSL reference](../../apps/docs/src/effects/scramble.md).

```bash
pnpm --filter @visamp/engine build:validator
pnpm --filter @visamp/validator verify:scramble
# Interactive local review (default port 4171):
pnpm --filter @visamp/validator verify:scramble --serve
```
