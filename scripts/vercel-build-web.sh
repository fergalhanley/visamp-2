#!/usr/bin/env bash
set -euo pipefail

# Vercel invokes this from apps/web; resolve paths from the script instead.
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

export PATH="${CARGO_HOME:-$HOME/.cargo}/bin:$PATH"

if ! command -v rustup >/dev/null 2>&1; then
  installer="$(mktemp)"
  trap 'rm -f "$installer"' EXIT
  curl --proto '=https' --tlsv1.2 --fail --silent --show-error --location \
    https://sh.rustup.rs --output "$installer"
  sh "$installer" -y --profile minimal --default-toolchain stable --no-modify-path
fi

rustup toolchain install stable --profile minimal
rustup target add wasm32-unknown-unknown --toolchain stable
export RUSTUP_TOOLCHAIN=stable

# Pin the packaging tool; --locked uses its published dependency lockfile.
if ! command -v wasm-pack >/dev/null 2>&1 || \
  [[ "$(wasm-pack --version)" != "wasm-pack 0.13.1" ]]; then
  cargo install wasm-pack --version 0.13.1 --locked --force
fi

rustc --version
wasm-pack --version
exec pnpm exec turbo run build --filter=@visamp/web
