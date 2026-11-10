//! Hardware-independent wallet logic for the ESP32-P4 signer.
//!
//! This crate is intentionally empty. It exists so that the repository's Rust
//! checks (formatting, lints, host tests and a build for the chip) run on
//! every pull request before any wallet code is written.
//!
//! It is `no_std`: it may not use the operating system, a heap or files, so
//! the same code runs on the chip and in host tests.
#![no_std]
