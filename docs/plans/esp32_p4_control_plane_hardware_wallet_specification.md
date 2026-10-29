# ESP32-P4 Bitcoin Blake2b Hardware Wallet & Adversarial Control Plane: Comprehensive Specification

## 1. Executive Summary & Project Mission

This repository (`esp32p4`) establishes a hybrid engineering control plane governing the development of an air-gapped, stateless Bitcoin hardware wallet targeting the **Waveshare ESP32-P4-WIFI6-Touch-LCD-3.5** (`ESP32-P4NRW32X`, dual-core RISC-V, target `riscv32imafc-unknown-none-elf`). 

The core philosophy of this project is **human oversight over autonomous adversarial execution**: rather than programming every line by hand, the Human Overseer acts as an architectural judge while a specialized team of AI agents plans, implements, reviews, audits, and verifies work. Control-plane guardrails—enforced via closed JSON Schema contracts, state-machine transitions, and explicit approval policies—ensure that safety, scope, and security invariants are upheld automatically.

---

## 2. Control-Plane Architecture & Governance (`AGENTS.md`)

---

---

## 4. Hardware Target & Cryptographic Specifications (ESP32-P4 & `#![no_std]` Rust)

The hardware wallet firmware is specified in `.github/instructions/rust-coder.instructions.md`:
- **Hardware Target**: Waveshare ESP32-P4-WIFI6-Touch-LCD-3.5 (`ESP32-P4NRW32X`, dual-core HP + single-core LP RISC-V, `riscv32imafc-unknown-none-elf`).
- **Memory & Secret Hierarchy**:
  - **768KB HP L2MEM (Internal SRAM)**: Reserved exclusively for call stacks, execution state, and **all cryptographic secrets** (entropy, BIP-39 mnemonics, BIP-32 `Xpriv` keys, signing nonces).
  - **32MB Stacked PSRAM**: Used via `esp-alloc` strictly for untrusted buffers (MIPI-CSI OV5647 camera framebuffers, QR decode matrices, untrusted PSBTs, ST7796 LCD framebuffers).
  - **16MB External Nor Flash**: Holds immutable firmware code and UI assets only (stateless invariant: zero writes of seeds, keys, PINs, or wallet history to Flash or TF card).
- **Cryptographic Primitives & Bitcoin Fork**:
  - Targets the **Blake2b Proof-of-Work hardfork** (RFC 7693 Blake2b). Uses the `blake2` crate (`no_std`) for block header PoW verification; never uses `sha256d` for block hashes.
  - Uses `rust-bitcoin` (`no_std`) and BIP-32 derivation (`bitcoin::bip32`); **never uses `bdk`**.
- **Cryptographic Hygiene**:
  - All secret-holding types derive/implement `zeroize::Zeroize` and `zeroize::ZeroizeOnDrop`.
  - Forbidden traits on secrets: `Copy`, `Clone`, `PartialEq`, `Eq`, `Hash`, and standard `Debug` (custom `Debug` outputs `[REDACTED]`).
  - All comparisons use `subtle::ConstantTimeEq`.
  - Panic-free parsing: `#![deny(clippy::unwrap_used)]`, `#![deny(clippy::expect_used)]`, `#![deny(clippy::indexing_slicing)]`.
- **Air-Gap & Radio Quarantine**:
  - Onboard ESP32-C6H8 Wi-Fi/BLE chip must have its reset/enable GPIO driven low at boot and power domain disabled via AXP2101 PMIC.
  - Production builds disable USB OTG 2.0 data descriptors and UART console.
- **Silicon Security & Advisory AR2026-006**:
  - Mandates **RSA-PSS 3072 Secure Boot v2** and transparent AES-XTS Flash Encryption to protect against early silicon verification vulnerabilities.

---

## 5. Agent Team Fleet & Least-Privilege Tool Strategy

---

## 6. Custom Agent Foundry (`custom-agent-foundry.agent.md`) — Repository-Specific Edition

---

## 7. Roadmap & Next Immediate Steps

1. **Wire Review Domain Mapping (`src/review-domains.js`) into Evidence CLI**: Connect domain checklist evaluation directly into `src/evidence.js` and `src/cli.js evidence` summaries.
2. **Bootstrap the `firmware/` `#![no_std]` Rust Workspace**: Initialize the `wallet-core` and `wallet-fw` crates for on-device RFC 7693 Blake2b hashing and BIP-32 key derivation.
3. **Automate Coordinator Execution**: Implement state-machine transition execution scripts to automate handoffs from task intake through verification.