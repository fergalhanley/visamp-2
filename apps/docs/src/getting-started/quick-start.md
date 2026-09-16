# Quick Start

## In the hosted editor

1. Open [Visamp](https://visamp.io) and choose **Create**. Sign in if prompted.
2. Paste the script below into the editor. Valid changes update the preview.
3. Edit a colour, radius or effect amount and watch the result.
4. Give the visual a title and check the save status. Use **Capture thumb** to
   create its thumbnail, and review visibility before sharing it.

```visript
render {
  draw::background(color: $COLOR_BLACK)
  draw::circle(x: $WIDTH / 2, y: $HEIGHT / 2,
    radius: $HEIGHT / 8, color: $COLOR_CORAL)
}
```

`render` draws once per frame. `$WIDTH` and `$HEIGHT` keep the composition relative
to the canvas size. The background replaces the previous frame; omitting it in
2D allows earlier drawings to accumulate.

## Add motion and sound

Change the radius expression to:

```visript
radius: $HEIGHT * (0.08 + audio::detect::get_bass() * 0.3)
```

This is an argument fragment, not a complete script. Play audio through the app
or select its microphone source to get live analysis. Browser audio and microphone
permission may require a user gesture. With no source, audio readings are zero.

For time-driven motion, use `$TIME_SEC` in an expression or update a property in
`on_frame`. Follow [Your First Script](first-script.md) for a complete example.

<!-- internal:start -->
## Running the repository locally

Creators using the hosted editor can skip this section. Repository development
uses **pnpm**, not the old standalone npm/port-8080 setup.

From the repository root, with Node 20+, pnpm and the engine Rust/WASM prerequisites:

```sh
pnpm install
# Configure apps/web/.env.local from apps/web/.env.example.
pnpm engine:build
pnpm --filter @visamp/web dev
```

The web app normally serves at `http://localhost:3000`; use the URL printed by
Next.js if that port is occupied. Supabase configuration is needed for account,
asset and save flows. See the repository README for full application setup.

To work on the documentation independently:

```sh
pnpm --filter @visamp/docs dev
```

Docs serve at `http://localhost:3200`. The docs runner downloads a pinned,
checksum-verified mdBook binary when that version is not installed locally; it
needs Node and `tar`, but does not build the Rust/WASM engine.

<!-- internal:end -->
