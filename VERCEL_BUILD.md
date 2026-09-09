# Web deployment build

The Vercel project root is `apps/web`. Enable access to source files outside the root directory for workspace dependencies. Keep the Next.js framework preset and the existing pnpm install command.

`apps/web/vercel.json` invokes `scripts/vercel-build-web.sh` through Bash. The script installs the stable Rust toolchain, the wasm32 target, and wasm-pack 0.13.1 before running Turbo for @visamp/web and its dependencies. The first build includes compiling wasm-pack and may take several minutes. Rust stable is intentionally a moving toolchain; wasm-pack is pinned.

The web build declares its environment variables in turbo.json, so they are available in strict mode and changes invalidate its cached output. Add new build configuration variables there as they are introduced. No secret values are committed. Engine tasks may still warn about web-only variables; those variables are intentionally scoped to the web task.

After merging, inspect the Vercel build for successful engine compilation and Next.js output. This bootstrap fixes the missing wasm-pack prerequisite; it does not establish that all later application build stages or runtime integrations succeed.
