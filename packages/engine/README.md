# @visamp/engine

The Visript engine — parser, interpreter and canvas renderer — written in Rust and
compiled to WebAssembly with `wasm-pack`.

## Layout

| Path                | Purpose                                        |
| ------------------- | ---------------------------------------------- |
| `src/parser.rs`     | pest-based parser for Visript                  |
| `src/model.rs`      | AST / runtime value model                      |
| `src/interpreter.rs`| Evaluates a script and drives the canvas       |
| `src/lib.rs`        | `wasm-bindgen` boundary exposed to JavaScript  |
| `src/scramble.rs`   | Scramble presets, timing and backend selection |
| `src/feedback.rs`   | Shared 2D/3D GPU feedback and resource ownership |
| `src/scramble.frag` | Composition, byte-addressed scramble and presentation |
| `visript.pest`   | Grammar                                        |
| `pkg/`              | Build output (gitignored)                      |

## Build

```bash
pnpm --filter @visamp/engine build   # or: turbo run build --filter=@visamp/engine
```

The same crate also exposes the native validator used by server-side code:

```bash
cargo build --release --bin visamp-validate
target/release/visamp-validate path/to/script.viscript
cat path/to/script.viscript | target/release/visamp-validate
```

Validation exits `0` and prints `OK` on success, or exits `1` and writes the
same positioned diagnostic used by the browser compiler. Run
`pnpm --filter @visamp/engine check:parity` to build both targets and verify
their recorded versions match.

## Runtime diagnostics

Parsed statements retain their 1-based starting line and column. When execution
fails, the interpreter attaches the innermost failing statement's location:

```text
Runtime error:  --> 60:5
  |
  = range end requires an integer, got float 240.0. Use integer division (\ 1) to convert.
```

The string API (`load_script` / `get_last_error`) stays unchanged. Both compile
and runtime diagnostics use `--> line:column` and a `= reason` line, understood
by `@visamp/player`. Runtime logs display those coordinates and include the line
for editor navigation. Outer loops, conditionals and function calls preserve an
already-located inner failure rather than replacing it with the caller's location.

Locations identify the first token of the statement, including for multiline
statements and runtime failures during init/resize. Host or renderer failures
outside statement execution can remain unlocated. Native validation checks
compilation only; it cannot rule out runtime errors. Exact failing expression
spans and function call stacks are tracked separately in
[VIS-94](https://linear.app/visamp/issue/VIS-94/highlight-exact-failing-dsl-expressions-and-show-function-call-stacks).

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
[Visript reference](../../apps/docs/src/effects/scramble.md).

```bash
pnpm --filter @visamp/engine build:validator
pnpm --filter @visamp/validator verify:scramble
# Interactive local review (default port 4171):
pnpm --filter @visamp/validator verify:scramble --serve
```

See [procedural point clouds](POINT_CLOUDS.md) for dense GPU point fields (2.3.0)
and model-backed textured particles (2.5.0).

## Frame capture

`capture_frame()` returns a `Promise<Blob>` containing an opaque 1280×720 PNG
for both 2D and 3D scripts. It rerenders the current render blocks at that size,
using copies of properties and runtime values and skipping lifecycle hooks.
3D captures support the same meshes, model points and bitmap sprites as playback.
Engine GPU filters are baked into the image, using the same pipeline as playback. Captures render a fresh frame; accumulated
feedback/scramble history from playback is not included.

One detached WebGL2 context is reused for 3D and filtered 2D captures, with recreation if its
context is lost. Pixels are copied to the output canvas synchronously before
asynchronous PNG encoding, so playback and later captures cannot clear the image.
Capture failures reject with JavaScript `Error` objects and retain Visript statement
locations where available.

Browser regression check: build with `pnpm --filter @visamp/engine build:validator`,
serve the repository root, then open `packages/engine/tests/browser/capture.html`.
The page checks PNG pixels, dimensions, filters, model sprites, repeated captures,
live state preservation, context loss recovery and error diagnostics.

## Procedural grids

`draw::grid` reuses the bounded point-field compiler and renderer for connected
triangle surfaces with interpolated vertex colours. `PointCloud.grid` selects
triangle topology; dimensions count unique vertices for the shared scene budget.
The vertex shader derives two triangles per cell from `gl_VertexID`, then uses a
row-major logical vertex index for fields. No CPU geometry or index buffer is
rebuilt per frame. Grid inputs are capped at 524,288 numbers per call and share
the existing 1,000,000-number scene cap. Point-cloud limits remain unchanged.

See `apps/docs/src/3d/overview.md` for syntax. Browser coverage lives in
`tests/browser/grid.html` (build the web-target WASM package and serve the repo).

## Language design

Follow the [Visript conventions](../../apps/docs/src/language/conventions.md) when
extending the language. The [September 2026 consistency review](reviews/2026-09-language-consistency.md)
records current exceptions, proposed names and the stored-source migration plan.

Engine 3.0 removes the old parameter spellings. See [migrating to 3.0](MIGRATING_V3.md)
for the source converter, SQL preparation and coordinated deployment requirements.

## Audio detection

Engine 3.1 exposes the [audio::detect library](../../apps/docs/src/programming/audio-detection.md).
The host pushes normalized audio-thread snapshots through `set_audio_analysis`;
`audio::AudioState` latches events and shared sample arrays at the render boundary.
Custom band queries use cached power prefix sums. Engine 4.0 removes the legacy audio globals and byte bridge; see [migration](MIGRATING_V4.md).

Verification: `cargo test --test audio_detect`, the player's audio-bridge tests,
and `pnpm --filter @visamp/web test:audio` cover the runtime and signal analysis.
For the real AudioWorklet → WASM → GPU path, build `pkg-validator` with the
web target, serve the repository root, and open `tests/browser/audio-detect.html`
under this package. Click **Run audio tests** to unlock browser audio.

Engine 4.1 adds `get_frequency()` for the original browser byte-spectrum response.
It is cached separately from the audio-thread linear spectrum. See
[frequency restoration](RESTORING_FREQUENCY.md) for backed-up script restoration.

## Filter output verification

See [the shared GPU filter design](reviews/2026-09-filter-output.md). After building
the validator WASM and serving the repository root, open
`packages/engine/tests/browser/filters.html` for pixel comparisons of playback and
capture, filter order, alpha, blur, feedback isolation, resize and context recovery.
