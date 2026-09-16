# Visamp documentation

The hosted Visript reference uses mdBook **0.5.4**, with Visamp branding layered
on the standard theme. Sources live in `src/`; generated `book/` is ignored.

## Public and internal editions

`DOCS_INCLUDE_INTERNAL=false` builds the public reference. This is also the
**default when unset**. Only the literal values `true` and `false` are accepted;
a misspelling fails the build. This is a build-time variable, not a browser flag.
Set it to **false** on the docs Vercel project for Production and Preview.

| Public: usable without repository access | Internal: project implementation and operation |
| --- | --- |
| Hosted editor instructions and complete examples | Running the repository locally |
| Language syntax, API contracts, units and limits | Contributor requirements and host integration APIs |
| Audio/input behaviour and creator troubleshooting | Design reviews, roadmap and Linear references |
| Asset use, rendering and thumbnail behaviour | Private repository links, sample packs and SQL imports |

The repo itself is private. Do not assume readers can access source-code links.
A behaviour or limit that affects script authors belongs in the public reference;
how to implement, deploy, administer or contribute to Visamp belongs internally.
Repository-only `README.md` and `reviews/` content is never part of either site.

```sh
# Public edition -> apps/docs/book (the only Vercel output directory)
pnpm --filter @visamp/docs build
# Internal edition -> apps/docs/book-internal
DOCS_INCLUDE_INTERNAL=true pnpm --filter @visamp/docs build
# Local internal preview, including public chapters, on port 3200
pnpm --filter @visamp/docs dev:internal
```

Use the build wrapper, not bare `mdbook build/serve`: it stages only the chapters
selected by the filtered SUMMARY and approved public assets before invoking
mdBook. Excluded content never reaches HTML, search indexes or static files.
The selected output is cleared before each build, removing stale pages. Internal
output is separate from `book`, and its header says **Internal Docs**. The flag
controls publication, not authentication; keep internal output on trusted hosts.

Restart any old docs development server to use the new wrapper. Both preview
commands watch source and theme edits. Environment variables are supplied by the
shell or Vercel; this standalone Node runner does not load Next.js `.env` files.

### Authoring rules

Wrap an internal section, including its heading and any links, in standalone
markers:

```html
<!-- internal:start -->
Internal content here.
<!-- internal:end -->
```

For a whole internal page, mark the page with `<!-- audience: internal -->` and
wrap its SUMMARY entry (and any public-page links to it) in the same section
markers. Prefer `src/internal/` for new internal pages. Unlisted pages and assets
are not copied. Register new public assets explicitly in `scripts/audience.mjs`.
Do not use mdBook source include directives; make the content a classified chapter.
Malformed or unbalanced internal markers fail both builds.

Run `pnpm --filter @visamp/docs test` to verify content filtering, omitted assets,
search/static output and stale-page cleanup. Run link checks for both editions:

```sh
pnpm --filter @visamp/docs check:links
DOCS_INCLUDE_INTERNAL=true pnpm --filter @visamp/docs check:links
```

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
- Environment variable: **`DOCS_INCLUDE_INTERNAL=false`** (Production and Preview).

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
