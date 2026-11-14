---
description: 'no_std Rust firmware conventions for the Waveshare ESP32-P4 air-gapped, stateless Blake2b Bitcoin hardware wallet'
applyTo: 'firmware/**/*.rs'
---

# Rust firmware conventions

Follow [AGENTS.md](../../AGENTS.md), the current task and the
[wallet development guide](../../docs/runbooks/wallet-development.md).
`firmware/wallet-core` is the existing hardware-independent `no_std` library;
inspect its current source before planning work. A bootable hardware crate and
peripheral drivers are not established by the library's cross-build.

## Sources and target

The owner selected the Waveshare ESP32-P4-WIFI6-Touch-LCD-3.5; the recorded
silicon target is ESP32-P4 revision v3.2. Chip revision is distinct from PCB
revision. Confirm the actual unit before applying revision-specific errata or
pin mappings. Use the relevant sheet in the
[device-references skill](../skills/device-references/SKILL.md), preserving its
verified, inferred and unverified distinctions.

The board sheet records vendor evidence for ST7796 display, FT6336 touch and
AXP2101 power management. The owner states the unit has the 5 MP OV5647 camera
installed; that is not checked on the device, and MIPI-CSI support in a `no_std`
stack is unproven. Trace actual wiring and confirm library support before driver work.
Historical plans, NotebookLM summaries and general ESP32 examples are research
input, not authoritative requirements for this board.

## Fork and authorization boundaries

- Sign only with the fork's unified sighash, using its pinned rules and test
  vectors. BLAKE2b proof of work is separate from the signature hash; do not
  replace standard hashes or add header verification without task scope.
- Keep transaction decoding, policy acceptance, user confirmation and signing
  separate. A parsed transaction or computed digest is not permission to sign.
- The signing policy must restrict accepted hash types, amounts, outputs, fees
  and derivation paths according to reviewed requirements. Do not silently
  choose limits or supported script types. Displayed transaction details must
  correspond to the exact bytes authorized and signed.
- Evaluate dependencies, features, licenses and build scripts against the
  fork rules and `no_std` target. Do not assume a Bitcoin library implements
  this fork, or write cryptographic primitives from scratch.

## Memory and input safety

- Runtime crates use `#![no_std]`; firmware binaries also use `#![no_main]`.
  Host tests may use `std`. Prefer borrowed slices and explicit buffer/count
  limits. Dynamic allocation needs a justified bound and failure behavior.
- Preserve the workspace lints in `firmware/Cargo.toml`: `unsafe` is forbidden;
  `unwrap`, `expect`, indexing, `panic!` and unchecked arithmetic are denied.
  Use `.get`, checked arithmetic and typed errors for hostile input. Do not
  weaken lints or add exceptions in library code without the owner's decision;
  a test file may allow them, as `tests/unified_sighash_vectors.rs` does. Any later
  hardware layer requiring `unsafe` needs its own reviewed boundary and SAFETY
  invariants; a comment alone does not satisfy the current policy.
- Never persist seeds, private keys or signing history. Keep secrets in internal
  SRAM and verify placement and access paths against the linked image, linker
  map and chip references. Source declarations alone do not prove placement.
- Use reviewed zeroization for entropy, mnemonics, passphrases and private keys
  on success, cancellation, timeout and failure. `ZeroizeOnDrop` or
  `Zeroizing<T>` does not prove cleanup after abort, reset or power loss; test
  the relevant lifecycle and memory behavior separately.
- Secret types must not implement `Copy`, `Clone`, `PartialEq`, `Eq`, `Hash` or
  leaking `Debug`. Redact diagnostic formatting and use public test fixtures.
  Use reviewed constant-time operations for secret-dependent arithmetic and
  comparisons; ordinary equality is not acceptable for secret values.
- Do not infer secp256k1 support from the hardware ECDSA capability. Verify the
  entropy-source enablement and conditioning design before seed generation;
  camera noise is neither required nor evidence of entropy quality.

## Physical boundaries

Firmware must not depend on the ESP32-C6 or its SDIO link. The owner chose C6
removal or antenna-feed removal; removing the antenna feed leaves the C6
running and is not equivalent to removing it. Physical rework and its checks
remain unverified. Software shutdown and omitted radio drivers do not prove
isolation. External data ports, debug access, optical transport and provisioning
need explicit task requirements; do not enable interfaces as an incidental
implementation convenience.

## Checks and result

Run `bash scripts/gates/firmware-check.sh` from the repository root in the
approved development environment, after confirming its pinned toolchain is
installed. `bash` runs the named script without flags. The script runs
formatting, Clippy with warnings as errors, host tests and a release cross-build
for `riscv32imafc-unknown-none-elf` using `firmware/rust-toolchain.toml`.
Do not install tools implicitly to obtain a passing result.

Add focused tests for the changed boundary, including malformed/truncated input,
limits and overflow where relevant. Use independently sourced known-answer
vectors for protocol code; expected values generated only by the implementation
under test are insufficient. Report exact source revisions, actual commands,
failures and unrun checks. A gate pass proves host checks and cross-compilation,
not boot, touch/camera operation, entropy quality, isolation or safe signing.
