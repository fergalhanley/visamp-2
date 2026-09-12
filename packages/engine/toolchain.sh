#!/usr/bin/env bash
# Shared toolchain preflight for every Rust entry point in this package.
#
# Sourced, not executed, so the PATH it repairs survives into the caller.
# `build-wasm.sh` sources it directly; everything else goes through
# `with-toolchain.sh`, which sources it and then runs the command given to it.
#
# Without this, `cargo` and `wasm-pack` are missing from a non-interactive
# shell on a machine whose rustup shims were never created, and the failure is
# "command not found" for a toolchain that is installed and working.

# 0. Check the toolchain before wasm-pack fails obscurely.
#
# rustup installs cargo and wasm-pack into ~/.cargo/bin, which a non-interactive
# shell does not necessarily have on PATH — so an install that works in a
# terminal can still report "command not found" from pnpm. Add it if it is there
# rather than making that the caller's problem.
if [ -d "$HOME/.cargo/bin" ]; then
  case ":$PATH:" in
    *":$HOME/.cargo/bin:"*) ;;
    *) PATH="$HOME/.cargo/bin:$PATH"; export PATH ;;
  esac
fi

# rustup normally puts shims for cargo and rustc in ~/.cargo/bin, but an
# installation can end up with a working toolchain and no shims — Homebrew's
# rustup without `rustup default`, for instance. rustup still knows where the
# real binaries are, so ask it rather than declaring Rust missing when it is
# sitting right there.
if ! command -v cargo >/dev/null 2>&1 && command -v rustup >/dev/null 2>&1; then
  toolchain_bin="$(dirname "$(rustup which cargo 2>/dev/null)" 2>/dev/null)"
  if [ -n "$toolchain_bin" ] && [ -x "$toolchain_bin/cargo" ]; then
    PATH="$toolchain_bin:$PATH"
    export PATH
    echo "ℹ Using the rustup toolchain directly; 'rustup default stable' would"
    echo "  restore the usual shims in ~/.cargo/bin."
  fi
fi

missing=""
command -v cargo >/dev/null 2>&1 || missing="$missing cargo"
command -v wasm-pack >/dev/null 2>&1 || missing="$missing wasm-pack"
if [ -n "$missing" ]; then
  echo "✗ Missing:$missing" >&2
  echo "  Install Rust:      https://rustup.rs" >&2
  echo "  Install wasm-pack: cargo install wasm-pack" >&2
  exit 1
fi

if ! rustup target list --installed 2>/dev/null | grep -q wasm32-unknown-unknown; then
  echo "✗ The wasm32-unknown-unknown target is not installed." >&2
  echo "  rustup target add wasm32-unknown-unknown" >&2
  exit 1
fi

# rust-lld loads libLLVM.dylib through an @rpath that resolves to the directory
# beside its own, while the toolchain ships the library one level up in lib/.
# The link then dies with SIGABRT and a dyld message that mentions neither Rust
# nor rustup.
#
# This is how the toolchain arrives, not damage: a clean uninstall/reinstall of
# stable 1.98.1 on aarch64-apple-darwin reproduces it exactly. Reinstalling is
# therefore not the fix, and the symlink is — it will need re-applying after
# each toolchain update until upstream ships the library where rust-lld looks.
lld_dir="$(rustc --print sysroot 2>/dev/null)/lib/rustlib/$(rustc -vV 2>/dev/null | awk '/^host:/{print $2}')/bin"
if [ -x "$lld_dir/rust-lld" ] && [ ! -e "$lld_dir/../lib/libLLVM.dylib" ] \
   && [ -e "$(rustc --print sysroot)/lib/libLLVM.dylib" ]; then
  echo "⚠ rust-lld cannot see libLLVM.dylib; the wasm link will fail." >&2
  echo "  The toolchain ships it one directory up from where rust-lld looks." >&2
  echo "  Reinstalling does not help — link it:" >&2
  echo "    ln -s ../../../libLLVM.dylib '$lld_dir/../lib/libLLVM.dylib'" >&2
fi
