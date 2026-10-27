---
description: 'no_std Rust firmware conventions for the Waveshare ESP32-P4 air-gapped, stateless Blake2b Bitcoin hardware wallet'
applyTo: 'firmware/**/*.rs'
---

# Rust Firmware Conventions: ESP32-P4 Stateless Blake2b Bitcoin Hardware Wallet

**Current status:** Hardware details and isolation methods below are research candidates, not verified board facts or approved requirements. Check the exact board revision, peripherals, protocol and trusted sources before relying on them. Do not assume disabling radios in software proves physical isolation. Wallet firmware implementation remains later work. Follow the current manual mode in AGENTS.md for ordinary requests.

Follow idiomatic `#![no_std]` embedded Rust practices, strict cryptographic hygiene, and hardware-specific constraints for an air-gapped, stateless Bitcoin hardware wallet (modeled after `privkeyio` Shrike / SeedSigner architecture) targeting the **Blake2b PoW Bitcoin hardfork**.

## 1. Target Hardware & Peripheral Architecture

Research input names the **Waveshare ESP32-P4-WIFI6-Touch-LCD-3.5** and target `riscv32imafc-unknown-none-elf` as candidates. Verify the exact board revision and toolchain before treating them as requirements.

- **Memory:** Verify actual memory types and sizes. Plan secret placement and zeroization using the verified memory map; do not persist private keys or seeds in a stateless wallet.
- **Peripherals:** ST7796 display, FT6336 touch, OV5647 camera and AXP2101 power management are unverified candidates from research. Confirm the actual components, interfaces and wiring before writing drivers.
- **Hardware security:** Verify the device's entropy source and security peripherals before choosing how to use them. Do not assume camera noise improves entropy without evidence.

## 2. Strict Air-Gap & Radio Quarantine Rules

- Verify whether the actual board contains radios and how they are connected. The research proposes ESP32-C6 and GPIO/PMIC shutdown; these are candidates, not approved facts or an approved isolation method.
- Compare physical and software isolation with evidence and obtain the owner's decision before choosing a method. Omitting drivers or powering a component down in software does not by itself prove physical isolation.
- Verify and decide which external data ports and optical interfaces are appropriate before prescribing a production configuration.

## 3. Bitcoin, BIP-32, and Blake2b Fork Rules

- **Core Bitcoin Stack**: Evaluate `rust-bitcoin`, `secp256k1`, BIP-32 and other candidate libraries against the verified fork specification, `no_std` support and the owner's choices. No library has been ruled out solely by this research note.
- **Blake2b PoW Consensus Overrides**:
  - This wallet targets the **Blake2b Proof-of-Work hardfork** of Bitcoin.
  - Verify the fork's exact proof-of-work and signing specifications before choosing algorithms or library parameters.
  - Evaluate the `blake2` crate against independently sourced fork test vectors; do not assume it matches the fork without verification.
  - Clearly separate standard SHA256/hash160 operations (used in scripts, taproot tree hashes, and legacy txids unless overridden by fork spec) from `Blake2bBlockHash` PoW verification using distinct newtypes.

## 4. `#![no_std]` Patterns to Follow

- Start every crate and binary with `#![no_std]` (and `#![no_main]` for firmware binaries).
- **Concurrency & Async**: Evaluate `embassy-executor`, `esp-hal` and their synchronization options against the verified hardware and selected toolchain. Avoid `std::sync` in `no_std` firmware.
- **Memory & Collections**:
  - Prefer fixed-capacity stack collections from `heapless` (`heapless::Vec<T, N>`, `heapless::String<N>`) with explicit compile-time bounds.
  - Prefer zero-copy parsing (`&[u8]`, `&str`) over owned allocations when decoding PSBTs and QR payloads.
- **Serialization**: Evaluate `serde`, `minicbor` or `postcard` for `no_std` encoding against the selected protocol and dependency constraints.
- **Architecture Separation**:
  - A separate `wallet-core` library and `wallet-fw` hardware crate are a possible future design. Evaluate that split when the owner chooses the wallet architecture; do not assume those crates or particular drivers already exist.

## 5. Cryptographic Hygiene & Memory Safety

- **Zeroization on Drop**:
  - All structs holding sensitive material (entropy bytes, mnemonic words, passphrase, BIP-32 `Xpriv`, raw secp256k1 secret keys) MUST derive or implement `zeroize::Zeroize` and `zeroize::ZeroizeOnDrop`.
  - Clear the signing context and wipe SRAM key buffers immediately after rendering the signed PSBT QR code or on any UI timeout/cancel event.
- **Forbidden Traits on Secret Types**:
  - **NEVER** derive or implement `Copy`, `Clone`, `PartialEq`, `Eq`, `Hash`, or standard `Debug` on secret-holding types.
  - Implement custom `core::fmt::Debug` on secret types that outputs only `f.write_str("SecretKey([REDACTED])")`.
  - Use `subtle::ConstantTimeEq` for all cryptographic digest, MAC, checksum, and signature comparisons.
- **No Panics on Untrusted Input**:
  - Camera QR payloads and PSBTs are hostile, untrusted inputs.
  - **NEVER** use `unwrap()`, `expect()`, or unchecked slice indexing (`buf[i]`) when parsing QR frames, CBOR, PSBTs, or transactions. Always use `.get(i)`, checked arithmetic (`checked_add`, `checked_mul`), and propagate errors via `Result<T, E>` and `?`.

## 6. Error Handling & Code Style

- Define domain-specific error enums implementing `core::error::Error` and `core::fmt::Display` (do not use `anyhow` or `std`-dependent `thiserror`).
- Ensure every `unsafe` block (e.g., ESP32-P4 DMA descriptors, MIPI-CSI ring buffers, or hardware register writes) is preceded by a `// SAFETY:` comment proving alignment, lifetime validity, and exclusive access.
- Keep lines under 100 characters, format with `rustfmt`, and enforce `#![deny(warnings)]`, `#![deny(clippy::unwrap_used)]`, `#![deny(clippy::expect_used)]`, and `#![deny(clippy::indexing_slicing)]` in library and parser code.

## 7. Quality & Security Checklist

Before completing or reviewing any Rust code, verify:

- [ ] **`#![no_std]` Compliance**: No unintended `std` dependencies; check the verified target when available.
- [ ] **Air-Gap Integrity**: Check the owner's chosen isolation method against the verified hardware; report gaps and unrun device checks.
- [ ] **Stateless Invariant**: No persistent writes of seeds, keys, or signing history to the verified storage devices.
- [ ] **SRAM Isolation & Zeroization**: Secrets reside only in internal SRAM, implement `ZeroizeOnDrop`, and never implement `Copy`, `Clone`, or leaky `Debug`.
- [ ] **Fork Accuracy**: Verify signing and hashing against the actual fork specification and independent test vectors. Record unavailable vectors rather than assuming a library is correct.
- [ ] **Panic-Free Parsing**: Zero `unwrap()`, `expect()`, or direct slice indexing `[i]` on camera/QR/PSBT inputs; all arithmetic on amounts/fees uses `checked_*`.
