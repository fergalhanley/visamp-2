#!/usr/bin/env bash
# Run a command with the Rust toolchain on PATH and checked.
#
#   ./with-toolchain.sh cargo test
#   ./with-toolchain.sh wasm-pack build --release --target web
set -e
. "$(dirname "$0")/toolchain.sh"
exec "$@"
