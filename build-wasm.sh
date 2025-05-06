#!/usr/bin/env bash
set -e

# 1. Build with wasm-pack in release mode
wasm-pack build \
  --release \
  --target bundler \
  --out-dir pkg

# 2. If wasm-opt is available, optimize each .wasm individually
if command -v wasm-opt >/dev/null 2>&1; then
  echo "🔧 Optimizing .wasm with wasm-opt…"
  for wasm in pkg/*.wasm; do
    echo "  • Optimizing $wasm"
    wasm-opt -O3 -o "$wasm" "$wasm"
  done
else
  echo "⚠ wasm-opt not found; skipping .wasm optimization."
  echo "  • To enable it, install Binaryen (e.g. 'brew install binaryen')"
fi

echo "✅ WASM built (and optimized if possible) in pkg/"
