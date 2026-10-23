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
