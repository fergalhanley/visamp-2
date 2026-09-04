# VisAmp render validator

An isolated HTTP service that runs the shipped Rust/WASM engine in pooled
headless Chromium instances. It compares candidate frame cost with the pinned
reference script in the same environment and reports independently configurable
render checks.

```bash
pnpm install
pnpm --filter @visamp/validator build
pnpm exec playwright install chromium
pnpm --filter @visamp/validator start
curl -X POST http://127.0.0.1:4318/validate \
  -H 'content-type: application/json' \
  --data-binary '{"script":"render { draw::clear() }"}'
```

The API should call this service over a private network. Do not expose it
directly to clients. Each request has a separate page/context, while browser
processes stay warm and are recycled after a timeout or runtime failure.
