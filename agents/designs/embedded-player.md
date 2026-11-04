# Embedded Visamp player

Owner-requested portfolio integration, implemented on local `develop` in
`/Users/fergal/Projects/Visamp/visamp-2`.

## Entry point

`/embed?mode=ambient|showcase&example=mandala|crystal-bloom|pointer-orbits`

Optional `vis=<public UUID or slug>` selects a public visualisation and adds it
before the bundled examples. Non-public and missing selections return 404.
Database errors fail closed. Anonymous Supabase access uses only the public
publishable key, with persistence, refresh and URL session detection disabled.
Asset resolution uses the existing RLS-backed resolver. Bundled examples need no
Supabase configuration; unrelated application routes still need public env vars.

The embed is part of this monorepo's existing web application:

- `apps/web/app/embed/page.tsx` is the iframe entry point.
- `apps/web/components/embed` contains the player UI and limited controls.
- `apps/web/lib/embed` contains examples, public-source access and messaging.
- `packages/player` supplies the existing reusable Rust/WASM renderer.

Both modes render the existing `@visamp/player` Rust/WASM engine, one per iframe.
Ambient has no input or chrome. Showcase exposes play/pause, example selection,
fullscreen, pointer/keyboard input, attribution and a link to the full site.
The initial selection is silent: no audio analyser, microphone, uploads, editor,
AI generation or account session. Example changes reuse the same canvas/engine.
The application shell is dynamically loaded only outside `/embed`, and the proxy
skips session refresh for `/embed`. This route is noindex.

## Parent contract (version 1)

The parent passes `parentOrigin` (an exact allowlisted HTTP(S) origin) and a unique
`instance`. Query parameters cannot expand the allowlist. Production Fergalflix
and fergalhanley.com origins are included; additional local/preview origins are
configured with `VISAMP_EMBED_PARENT_ORIGINS` at build and runtime. The route's
CSP `frame-ancestors` uses the same list. Keep preview origins explicit.

The Vercel build script runs through Turborepo's strict environment mode.
`VISAMP_EMBED_PARENT_ORIGINS` must remain in the `@visamp/web#build.env` list in
`turbo.json`: otherwise Turbo filters it out before Next generates the CSP,
even when the variable exists in Vercel. Including it in `env` also invalidates
the cached web build when the allowlist changes. Set it in the target Vercel
environment and deploy a revision containing this Turbo configuration.

Every message contains `channel: "visamp:embed"`, `version: 1`, `instance`, `type`.
The iframe sends `ready` once its listener is attached, `rendered` after successful
script activation with assets ready, or `error` on player/asset failures.
`rendered` indicates successful activation, not a GPU pixel-readback assertion.
The host replies with `type: "host-state"`, `active: boolean`,
`userInitiated: boolean`. Both sides verify exact origin, source window, instance,
channel and version. No arbitrary script or URL execution command exists.

`active` follows viewport/document visibility and host pause state.
`userInitiated` is a one-shot play request that also permits motion after explicit
user action. Reduced-motion preferences prevent automatic playback. The portfolio
also skips automatic iframe loading when data-saving is requested. The showcase
loads on click. Parent failure or timeout leaves a static poster/direct site link.

## Local review

1. `pnpm install --offline --frozen-lockfile --ignore-scripts`
2. `CARGO_NET_OFFLINE=true pnpm engine:build`
3. Set `VISAMP_EMBED_PARENT_ORIGINS=http://127.0.0.1:3000,http://localhost:3000` in
   `apps/web/.env.local`. Public Supabase settings are needed for the full build.
4. `WATCHPACK_POLLING=true pnpm --filter @visamp/web exec next dev --webpack --hostname 127.0.0.1 --port 3001`
5. Fergalflix sets `NEXT_PUBLIC_VISAMP_EMBED_URL=http://127.0.0.1:3001/embed` and
   runs at port 3000; open `/` and `/play/visamp`. The hero selects `memory-flower`.

The development server also needs `allowedDevOrigins: ["localhost", "127.0.0.1"]`
(in `next.config.ts`). The browser can mark iframe asset requests cross-site
when the parent and child use different loopback hostnames. Without this setting,
Next returns the embed HTML but rejects JavaScript/HMR requests with HTTP 403,
leaving the player unable to hydrate. Verified the failure with browser-style
Origin/Referer/Sec-Fetch-Site headers, then all 17 initial scripts returned 200
after the fix. Untrusted origins still return 403.

Deploy Visamp's embed route before setting Fergalflix's production environment
variable to `https://www.visamp.io/embed` and rebuilding it. Deployment and
production configuration changes remain separate from this implementation.

## Verification

WASM build, all three sample scripts through the native compiler, focused embed,
public-source, shell and player tests, TypeScript and both production builds.
HTTP checks cover both modes, CSP, no session cookies, rejected parent origins,
invalid identifiers and the Fergalflix showcase route. The webpack build reports
an existing asyncWebAssembly/async-await target warning.

Browser/GPU rendering and visual layout still need an interactive browser review;
computer-use access was unavailable. Test fullscreen, pointer/Shift input,
scroll/tab suspension, reduced motion, save-data and blocked-iframe fallback in
that review. Public selection is tested with a mocked anonymous query; no live
Supabase record was selected or published during this task.
