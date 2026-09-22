# Release versions

VisAmp's displayed release version comes from the root `package.json` (`version`,
initially `2.0.0`). Update it manually before building the release. The web
workspace's own package version is not the product release number.

The engine version comes from `packages/engine/package.json` through the exported
`@visamp/engine/package.json` metadata. The player exposes `engineVersion` from
both `@visamp/player` and the lightweight `@visamp/player/version` entry point.
Use the latter for server-rendered pages or other consumers that do not need the
renderer: reading the version does not initialise or bundle the WASM engine.

The About page (`/site/about`, also reached through `/about`) displays both values.
These are package versions captured in the deployed build, not a live lookup of
the repository. Changing either manifest requires a new build/deployment before
the site shows the new version. They are not commit IDs or runtime WASM hashes.
