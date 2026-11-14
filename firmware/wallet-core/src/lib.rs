//! Hardware-independent wallet logic for the ESP32-P4 signer.
//!
//! * [`tx`] reads a serialized transaction without copying it.
//! * [`sighash`] computes the fork's unified signature hash: the 32 bytes a
//!   signature commits to.
//!
//! Nothing here holds a key or signs. The crate is `no_std` and uses no heap,
//! so the same code runs on the chip and in host tests. Every function that
//! reads outside data returns an error instead of panicking.
#![no_std]

pub mod sighash;
pub mod tx;
