#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$script_dir"

cargo build --release --bin visamp-validate
./build-wasm.sh

native_version="$(../../target/release/visamp-validate --version)"
wasm_version="$(node -p "require('./pkg/package.json').version")"

if [[ "$native_version" != "$wasm_version" ]]; then
  echo "Compiler version mismatch: native=$native_version wasm=$wasm_version" >&2
  exit 1
fi

echo "Compiler targets match at version $native_version"
