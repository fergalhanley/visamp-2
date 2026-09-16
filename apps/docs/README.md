# Visamp documentation

The hosted Visript reference uses mdBook **0.5.4**, with Visamp branding layered
on the standard theme. Sources live in `src/`; generated `book/` is ignored.

## Local development

From the repository root (Node.js 20 or newer):

```sh
pnpm --filter @visamp/docs dev
pnpm --filter @visamp/docs build
```

The development URL is `http://localhost:3200`. The runner uses an installed
mdBook of the pinned version, or downloads an official release into `.cache/`
and verifies its SHA-256 checksum. macOS and Linux, on ARM64 and x64, are
supported automatically. Other platforms can install the pinned version and set
`MDBOOK_BIN` to its executable. Downloading requires GitHub access and `tar`.
`MDBOOK_DOWNLOAD=1` bypasses the executable on PATH to exercise the download/cache
path. No Rust toolchain is required to build the site.

## Vercel deployment

Create a **separate Vercel project** from this repository:

- Root Directory: **`apps/docs`**.
- Framework Preset: **Other**.
- Production Branch: **`main`**, matching the repository release policy.
- Build Command: `node scripts/mdbook.mjs build`.
- Output Directory: `book`.
- Install Command: `true` (the docs build has no npm dependencies).
- Use Node.js 20 or newer.

`vercel.json` supplies the build, install, framework and output settings. No
application secrets or database connection are needed. Keep the standard static
routing: mdBook produces real `.html` pages, including nested paths; do not add
an SPA fallback rewrite. Add `docs.visamp.io` in this project's domain settings
and follow Vercel's DNS instructions. Preview deployments work at their own root
URL without requiring the production domain.

See Vercel's [build configuration](https://vercel.com/docs/builds/configure-a-build)
and [project configuration](https://vercel.com/docs/project-configuration/vercel-json).
Deployment and DNS changes are performed by the project owner.

## Web app link

The web app reads **`NEXT_PUBLIC_DOCS_URL`**:

- `apps/web/.env.local`: `http://localhost:3200`.
- Web app Vercel production environment: `https://docs.visamp.io`.

The production URL is also the fallback when the variable is absent. Set the
variable on the **web app project**, not the static docs project. Next.js embeds
public environment variables at build time: redeploy the web app after changing
it. Restart local development if the new setting has not appeared. The Docs link
opens a new tab so playback and editor state remain available.

## Maintaining the reference

Use `visript` fenced code blocks for language examples and `text` for syntax
templates or deliberately invalid examples. Complete scripts contain a `render`
block; fragments should be introduced as fragments. Keep signatures, defaults,
units and context restrictions aligned with the engine and editor catalogue.

Build the native validator, then validate complete examples:

```sh
cargo build --release -p visamp_2 --bin visamp-validate
pnpm --filter @visamp/docs check:examples
```

The validator checks compilation, not visual output or runtime asset access.
Historical design proposals are excluded. Review new examples in the player too.
After building, `pnpm --filter @visamp/docs check:links` checks generated local
links, assets and anchors. Verify search, navigation, code copying, and desktop
and mobile layouts when changing the theme.

The theme overrides only the header, head hook, favicon, additional CSS and highlighting;
mdBook still owns search, navigation and accessibility behaviour. See the
[mdBook theme guide](https://rust-lang.github.io/mdBook/format/theme/index.html).
