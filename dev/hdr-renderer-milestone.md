> The shape-only 2D milestone below is historical. See [the complete 2D implementation contract](hdr-2d-implementation.md) for the current backend and verification gates.

# HDR rendering milestone — integration plan

## Implementation progress (2026-10-23)

- Added `packages/player/src/webgpu-hdr-renderer.ts`: first working-code WebGPU render path for a clear colour and unlit triangles, with float RGBA colour values above 1. The module is **not yet connected** to the Rust scene command buffer, player, or Visript execution.
- Added packing unit tests for HDR values and invalid vertex data.
- Added `@webgpu/types` in player devDependencies. **Before merging**, run `pnpm install` to update and commit `pnpm-lock.yaml`, followed by `pnpm --filter @visamp/player test` and `pnpm --filter @visamp/player check-types`. These commands have not been run by this assistant.
- Current implementation allocates a transient GPU buffer per render, and is intended only for validation; reuse buffers before production frame loops.
- Next: expose/translate a minimal subset of `scene.rs` through a stable Rust-to-JS frame contract, add a side-by-side scene parity demo, then integrate guarded opt-in with device-loss fallback.



Status: **foundation / not a working Visamp HDR renderer**. The standalone experiment is in `experiment/webgpu-hdr-brightness`.

## Confirmed from source inspection

- `packages/engine/src/lib.rs` chooses Canvas 2D or WebGL2 once per script/context. An HTML canvas cannot switch contexts; the engine currently replaces its canvas when changing between 2D and 3D.
- `packages/engine/src/scene.rs` is a browser-independent 3D command buffer, consumed by `packages/engine/src/renderer.rs`. This is the best first WebGPU integration seam.
- `packages/player/src/visamp-canvas.tsx` hosts a WASM singleton and lets the engine own the canvas.
- The existing WebGL2 implementation is the compatibility baseline and should not be removed.
- macOS Chrome 155 required a compositor workaround during the standalone HDR experiment.

## Incremental implementation

1. **Preflight:** detect `(dynamic-range: high)` and `navigator.gpu` in the player. Detection only indicates eligibility; it cannot prove physical HDR presentation. Do not automatically switch the engine on this signal alone.
2. **Scene parity proof:** extract a backend-independent representation of a minimal 3D scene. Implement `clear`, one unlit primitive and unlit colours in WebGPU. Compare output with WebGL for the same command buffer. Do not copy WebGL canvases into WebGPU on every frame.
3. **HDR presentation:** create a *separate* WebGPU-owned canvas configured with `rgba16float`, `colorSpace: "display-p3"` and `toneMapping: { mode: "extended" }` where available. Test whether Chrome actually presents highlights above SDR white on XDR hardware, including Chrome compositor variations. Make fallback explicit.
4. **Visript API:** design `emission` or equivalent separately from alpha and base colour. Preserve old scripts and SDR behaviour. Store and process values above 1.0 without premature clipping, and make tone mapping a final-output concern.
5. **Rollout:** user-controlled opt-in first; feature gate and telemetry for successful/failed device/context creation. Handle device loss and fall back to existing WebGL2; ensure exports and thumbnail captures retain predictable SDR output.

## Definition of done

- A Visript 3D scene renders through both backends with identical animation/audio state.
- HDR colour values >1 survive to an extended-range presentation surface on a confirmed supported configuration.
- Unsupported hardware and device loss preserve WebGL playback; no blank stages.
- No regressions in existing 2D/WebGL visuals, editor, playback, capture or exports.
- CI tests cover detection/fallback and at least one renderer smoke test; XDR manual acceptance compares HDR and SDR.
- Flashing controls, capped brightness and accessible defaults are addressed before enabling by default.

## Important non-goals for foundation commit

This commit does **not** implement a WebGPU renderer, change the existing WebGL shaders, change Visript syntax, or turn HDR on in the application. The standalone proof remains the hardware validation surface.

## Scene bridge progress (2026-10-23)

The branch now includes a **read-only, opt-in integration seam**, not a player switch:

- Rust `hdr_snapshot::snapshot` converts the most basic unlit 3D cubes and planes to clip-space triangles and serializes a JSON frame. It rejects unsupported materials, lighting, textures, wireframes, overlays, and point clouds rather than silently losing them. It is capped at 16,384 triangles and currently has no near-plane clipping or depth buffer, so **3D visual parity is not yet guaranteed**.
- WASM exports `get_hdr_scene_snapshot()`, which returns a snapshot of the last recorded scene. It does not modify active WebGL rendering.
- TypeScript `readHdrScene()` validates the snapshot and produces the input accepted by `HdrSceneRenderer.render()`. There is not yet a live player call site or automatic frame synchronization; that is the next milestone.
- Unit tests cover empty Rust snapshots and TypeScript parsing. **Tests and Rust compilation have not been run in this session.** Run `cargo test --manifest-path packages/engine/Cargo.toml`, `pnpm --filter @visamp/engine build`, `pnpm --filter @visamp/player check-types`, and `pnpm --filter @visamp/player test` locally, review errors, and update generated WASM artifacts according to existing project practice.

Next: add an isolated dual-canvas player harness that reads the scene after the Rust render tick (without racing the frame), only allows the supported subset, and falls back visibly to WebGL when a snapshot fails. Do not enable HDR automatically until depth, clipping, transparency and capture/export semantics are addressed.

## Opt-in player comparison path

The player now accepts `<VisampCanvas hdrPreview />` to split the same stage into **WebGL (left)** and **WebGPU HDR (right)**. Default is `false`; production callers are unaffected. This should only be enabled in an isolated developer route or harness. WebGPU reads `get_hdr_scene_snapshot()` once per animation frame from the same WASM singleton; snapshot/render errors are displayed in the HDR half instead of suppressing the WebGL player. Current output is **not visually equivalent** for overlapping 3D geometry: depth testing, near-plane clipping, alpha blending and many shapes are not supported. The last scene may be one frame behind. No compositing workaround is applied in this integration path yet. Avoid treating a successful snapshot as proof of hardware HDR presentation.

Before trying: `cargo test --manifest-path packages/engine/Cargo.toml`, `pnpm --filter @visamp/engine build`, `pnpm --filter @visamp/player check-types`, `pnpm --filter @visamp/player test`. Then add `hdrPreview` to an isolated invocation of `VisampCanvas` with a 3D script containing only unlit cubes or planes; do not enable globally. These latest changes have not been validated locally by the assistant.

## Browser route for XDR acceptance

The opt-in comparison is accessible at **http://localhost:3000/dev/hdr-compare** with `pnpm --filter @visamp/web dev`. The server route calls `notFound()` outside development to prevent it appearing on deployed production/preview environments. On the test route, click **Start comparison** and leave **WebGPU HDR preview** enabled. You should see the normal WebGL scene on the left and the experimental Rust-snapshot/WebGPU scene on the right. Captures, staging and Visript scripts elsewhere remain unchanged.

Before opening the page, rebuild the WASM engine with `pnpm --filter @visamp/engine build`; run `pnpm --filter @visamp/web check-types` and player checks. Report compile errors, missing WASM export, right-hand blank canvas or snapshot rejection. Cube-face ordering differences are expected until depth support is implemented. **The route and browser output have not been tested by this assistant.**

## Visript intensity prototype

Approved syntax: `draw::cube(intensity: 3.0)` uses a direct RGB multiplier, default `1.0`. The interpreter records the multiplier alongside each scene command. The existing WebGL2 renderer deliberately uses the unmodified base colour, while the experimental WebGPU scene snapshot multiplies RGB and preserves alpha. `0.0` through `6.0` is the current prototype range; values outside are rejected. This is NOT the final SDR tone-mapping implementation: the current WebGL side remains base colour rather than tone-mapped HDR, and the diagnostic page still has its separate global brightness slider. The development route uses intensity 3 to exercise the new syntax. **Requires local Rust tests, WASM rebuild, player/web checks, and browser acceptance; no claim of passing CI yet.**

## Approved scope extension: 2D HDR (2026-10-23)

The current HDR milestone **also includes 2D Visript**. Use identical author-facing syntax in both contexts: `intensity: 1.0` is neutral; values above 1 request proportionally greater linear RGB output on an HDR-capable renderer. This is a specification decision, **not confirmation that 2D HDR works yet**.

Implementation sequence:

1. Preserve the current Canvas 2D path untouched for existing visuals. Do not pretend its CSS colour conversion (which clamps to 0–1) can show HDR.
2. Add a renderer-independent 2D draw-command representation for basic primitives (begin with clear, circles and rectangles, then lines). The interpreter must feed this alongside its current Canvas 2D calls rather than rely on screenshots/readbacks.
3. Implement the commands in an opt-in WebGPU 2D backend using `rgba16float` and extended tone mapping. Match geometry, coordinates, ordering, alpha composition and gradients before expanding.
4. Carry the approved `intensity` argument into the 2D command representation (direct RGB multiplier; default 1). Keep opacity and brightness independent. Add explicit SDR tone mapping at output, not per-command clipping.
5. Add isolated 2D SDR/HDR comparison tests and browser acceptance on an XDR display. Feature-detect and keep Canvas 2D fallback on unsupported platforms.

Acceptance: a basic audio-reactive 2D Visript script exhibits brighter-than-SDR coloured highlights on the XDR hardware, with unchanged Canvas 2D fallback; no 2D script must silently change appearance. This scope extension does not make the current 3D prototype merge-ready.

## 2D renderer implementation progress

A first independent 2D geometry translator is now implemented at `packages/player/src/hdr-2d-geometry.ts`. It converts Canvas-style pixel coordinates for solid rectangles and circles to normalized-device-coordinate triangles, with per-shape `intensity` multiplied into RGB and alpha unchanged. Those triangles can be passed to the existing `HdrSceneRenderer`. Unit tests cover coordinates, brightness, shape count and invalid inputs. This is a renderer foundation only: **it is not yet connected to Canvas 2D's live Rust drawing commands, not enabled in normal playback, and has no guaranteed parity for gradients, transforms, clipping or alpha blending**. Next is a Rust 2D command export or dual recorder and an isolated comparison harness, then lines and other primitives. Local type checking and test results remain unverified for these latest commits.

## Development-only 2D browser test

Open `/dev/hdr-2d` in a locally running development server after pulling this branch. The page draws a cyan circle and pink rectangle both through a plain Canvas 2D reference (left) and using the new `tessellateHdr2D` plus `HdrSceneRenderer` (right). The slider controls **only** the WebGPU HDR intensity; it does not yet test any Visript script. Compare 1× and 3× on an XDR display. This route deliberately does not need the Rust/WASM singleton, allowing the geometry stage to be verified before recording 2D Rust draw commands. To validate, run `pnpm --filter @visamp/player test`, `pnpm --filter @visamp/player check-types`, and `pnpm --filter @visamp/web check-types`; browser rendering and these commands remain unverified by the assistant. The next milestone is a read-only Rust 2D command recorder and a live Visript side-by-side renderer; continue keeping production Canvas 2D unchanged.
