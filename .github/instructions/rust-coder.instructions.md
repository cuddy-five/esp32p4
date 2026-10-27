---
description: 'no_std Rust firmware conventions for the Waveshare ESP32-P4 air-gapped, stateless Blake2b Bitcoin hardware wallet'
applyTo: '**/*.rs'
---

# Rust Firmware Conventions: ESP32-P4 Stateless Blake2b Bitcoin Hardware Wallet

Follow idiomatic `#![no_std]` embedded Rust practices, strict cryptographic hygiene, and hardware-specific constraints for an air-gapped, stateless Bitcoin hardware wallet (modeled after `privkeyio` Shrike / SeedSigner architecture) targeting the **Blake2b PoW Bitcoin hardfork**.

## 1. Target Hardware & Peripheral Architecture

All firmware targets the **Waveshare ESP32-P4-WIFI6-Touch-LCD-3.5** (`ESP32-P4NRW32X`, 32-bit dual-core HP + single-core LP RISC-V, target `riscv32imafc-unknown-none-elf`).

- **Compute & Memory Hierarchy**:
  - **768KB HP L2MEM (Internal SRAM)**: Reserved for the call stack, execution state, and **all cryptographic secrets** (entropy, BIP-39 seeds, BIP-32 `Xpriv` keys, signing nonces). Never place secrets in external PSRAM.
  - **32MB Stacked PSRAM**: Use via `esp-alloc` exclusively for untrusted, high-volume buffers: MIPI-CSI camera framebuffers, QR decode matrices, untrusted raw PSBTs prior to parsing, and LCD framebuffers.
  - **16MB External Nor Flash**: Holds immutable firmware code and UI assets only. **Stateless invariant**: Never write user seeds, private keys, PINs, or wallet descriptors to Nor Flash or the onboard TF card slot.
- **Fixed Peripheral Map**:
  - **Display**: 3.5-inch 320x480 IPS LCD driven by **ST7796** over **SPI**. Use `embedded-graphics` and offload scaling/rotation/blending to the ESP32-P4 **Pixel Processing Accelerator (PPA)** and DMA.
  - **Touch Input**: **FT6336** capacitive touch controller over **I2C**.
  - **Optical Air-Gap (Camera)**: **OV5647** 5MP camera over 2-lane **MIPI-CSI**, piped through the hardware **Image Signal Processor (ISP)** for QR code ingestion (UR / animated QR frames).
  - **Power Management**: **AXP2101** PMIC over **I2C** for rail control, battery telemetry (3.7V MX1.25 LiPo), and immediate power-off/wipe triggers via the onboard PWR button.
  - **Hardware Security**: Use the ESP32-P4 hardware **RNG (TRNG)** combined with camera sensor noise for entropy generation. Leverage Secure Boot, Flash Encryption, and Access Permission Management (APM).

## 2. Strict Air-Gap & Radio Quarantine Rules

- **ESP32-C6H8 Co-Processor Lockdown**: The board includes an onboard ESP32-C6H8 Wi-Fi 6 / BLE 5 chip wired over SDIO.
  - **NEVER** import `esp-wifi`, `bleps`, or initialize SDIO host drivers connected to the ESP32-C6.
  - During boot (`main.rs` initialization), explicitly drive the ESP32-C6 reset/enable GPIO pins low and disable its power domain via the AXP2101 PMIC if wired to a switchable rail.
- **Data Port Lockdown**:
  - Production builds (`--release`) must disable USB OTG 2.0 High Speed data descriptors, USB-to-UART console output, and SDIO TF card mounting unless explicitly gated behind a compile-time debug feature (`#[cfg(feature = "dev-uart")]`).
  - The sole production I/O channels are the **OV5647 camera** (inbound QR) and **ST7796 LCD** (outbound QR).

## 3. Bitcoin, BIP-32, and Blake2b Fork Rules

- **Core Bitcoin Stack**:
  - Use **`rust-bitcoin`** (`bitcoin` crate with `default-features = false`, `no-std`) and `secp256k1` (`default-features = false`).
  - **NEVER** use or suggest `bdk` (Bitcoin Development Kit).
  - Use strict **BIP-32** hierarchical deterministic key derivation (`bitcoin::bip32`).
- **Blake2b PoW Consensus Overrides**:
  - This wallet targets the **Blake2b Proof-of-Work hardfork** of Bitcoin.
  - Never use `sha256d` (`bitcoin::hashes::sha256d`) to compute or verify block Proof-of-Work hashes.
  - Use the `blake2` crate (`default-features = false`) configured for the fork's exact Blake2b personalization/digest parameters when verifying block headers, compact block filters, or SPV proofs.
  - Clearly separate standard SHA256/hash160 operations (used in scripts, taproot tree hashes, and legacy txids unless overridden by fork spec) from `Blake2bBlockHash` PoW verification using distinct newtypes.

## 4. `#![no_std]` Patterns to Follow

- Start every crate and binary with `#![no_std]` (and `#![no_main]` for firmware binaries).
- **Concurrency & Async**: Use `embassy-executor` and `esp-hal` async drivers for non-blocking SPI (LCD), I2C (FT6336/AXP2101), and MIPI-CSI DMA transfers. Use `embassy_sync::mutex::Mutex` or `critical_section::Mutex` instead of `std::sync`.
- **Memory & Collections**:
  - Prefer fixed-capacity stack collections from `heapless` (`heapless::Vec<T, N>`, `heapless::String<N>`) with explicit compile-time bounds.
  - Prefer zero-copy parsing (`&[u8]`, `&str`) over owned allocations when decoding PSBTs and QR payloads.
- **Serialization**: Use `serde` with `default-features = false` (`serde_core`) or `minicbor` / `postcard` for `no_std` binary encoding (e.g., UR / BC-UR multipart QR payloads).
- **Architecture Separation**:
  - Split hardware-independent consensus, Blake2b validation, BIP-32 derivation, and PSBT signing into a pure `#![no_std]` library crate (`wallet-core`) that runs host-side `cargo test` on x86_64/ARM.
  - Keep ESP32-P4 register setup, DMA buffers, ST7796/FT6336/OV5647 drivers, and AXP2101 management in the firmware crate (`wallet-fw`).

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

- [ ] **`#![no_std]` Compliance**: Zero `std` imports; compiles cleanly for `riscv32imafc-unknown-none-elf`.
- [ ] **Air-Gap Integrity**: No initialization of ESP32-C6 SDIO, Wi-Fi, BLE, or production USB data links.
- [ ] **Stateless Invariant**: Zero writes of seeds, keys, or signing history to the 16MB Nor Flash or TF card.
- [ ] **SRAM Isolation & Zeroization**: Secrets reside only in internal SRAM, implement `ZeroizeOnDrop`, and never implement `Copy`, `Clone`, or leaky `Debug`.
- [ ] **Blake2b & BIP-32 Accuracy**: Uses `rust-bitcoin` (`no-std`) + BIP-32 (no `bdk`), and validates block PoW exclusively with Blake2b (`blake2`), never `sha256d`.
- [ ] **Panic-Free Parsing**: Zero `unwrap()`, `expect()`, or direct slice indexing `[i]` on camera/QR/PSBT inputs; all arithmetic on amounts/fees uses `checked_*`.
