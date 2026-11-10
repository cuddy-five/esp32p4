#!/usr/bin/env bash
# The Rust checks for firmware/. CI's `firmware` job runs this file, so an
# agent, a reviewer and CI all run the same four commands. It needs rustup;
# firmware/rust-toolchain.toml selects the compiler, components and target.
set -euo pipefail

cd "$(dirname "$0")/../../firmware"

echo "== 1/4 formatting (cargo fmt)"
cargo fmt --all --check

echo "== 2/4 lints, warnings are errors (cargo clippy)"
cargo clippy --workspace --all-targets --locked -- -D warnings

echo "== 3/4 host tests (cargo test)"
cargo test --workspace --locked

echo "== 4/4 no_std build for the candidate ESP32-P4 target (riscv32imafc-unknown-none-elf)"
cargo build --workspace --release --locked --target riscv32imafc-unknown-none-elf

echo "firmware checks: ok (host tests and a cross-build only; nothing ran on a device)"
