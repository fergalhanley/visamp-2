# VIS-116: reference review against engine 5.2

## Coverage and corrections

Reviewed the published chapters against the engine builtin catalogue, interpreter,
drawing implementation, existing example packs, and web editor/player behaviour.
The newer audio, input, drawing and effects pages already covered their APIs;
the largest gaps were older introductory and 3D material that contradicted them.

- Replaced the obsolete local startup instructions and added the hosted editor workflow.
- Corrected 3D limitations: planar drawing, strokes, final overlays and bloom are implemented.
- Corrected render property writes, capture isolation, frame order and context switching guidance.
- Documented host asset preloading, capture dimensions and the effect of caching viewport sizes.
- Corrected integer range conversion, the 10,000 iteration limit and unsupported compound assignment.
- Repaired example function defaults, named calls, trigonometry and coordinate array access.
- Added a standard-library map, runtime/capture guide, troubleshooting and sample-pack index.
- Marked language fences for highlighting and kept intentionally invalid snippets as text.
- Preserved the drawing expansion proposal as historical contributor material.

## Hosting and branding decisions

Keep mdBook and existing URLs, search, copy controls and theme navigation. Use
Visamp's existing logo assets and a responsive dark green theme, retaining light
mode. Register the Visript highlighter before mdBook processes code blocks.

Pin mdBook 0.5.4 and verify downloaded release archives by SHA-256. Vercel builds
this as a static site from `apps/docs`; no Rust compilation or app secrets are
needed. The owner configures the separate docs project/domain and deploys.

The app uses `NEXT_PUBLIC_DOCS_URL` for the shared desktop/overflow Docs link,
opening in a new tab to preserve playback/editor state. Local configuration uses
`http://localhost:3200`; the production fallback is `https://docs.visamp.io`.

## Verification

- Pinned native download/checksum/build path exercised successfully on macOS ARM64.
- 72 complete documentation examples compile with the current native validator.
- Generated local links/assets/anchors checked across 37 HTML pages.
- Browser checks: desktop and mobile layouts, light theme, nested-page logo/home
  links, search for kaleidoscope, copy control, syntax highlighting; no docs
  console warnings/errors after correcting highlighter load order.
- Web app Docs destination and new-tab behaviour checked in desktop and mobile
  overflow navigation; TypeScript and targeted ESLint checks pass.

Compilation does not test visual output of every example. Vercel's Linux build,
production DNS and deployment remain for the owner to verify during deployment.
See [deployment instructions](../README.md).

## Follow-up: publication boundary

The repository is private. The production reference now uses public-only source
staging by default (`DOCS_INCLUDE_INTERNAL=false`). Local setup, contributor
conventions, design notes, private sample/SQL instructions, host integration APIs
and private project links are internal. Script-facing syntax, runtime behaviour,
limits and examples remain public. Internal content is available with the flag
set to true, in `book-internal`, separate from Vercel's `book` output.

Section markers filter prose and SUMMARY entries before mdBook sees them. Only
listed chapters and allowlisted public assets are staged. Whole internal pages
also carry an audience marker, rejected if accidentally listed publicly. Output
is cleaned before building. Tests inspect generated HTML, search and static files,
including internal-to-public transitions and stale private pages. Turbo build
cache keys include the flag. See README for authoring and deployment rules.
