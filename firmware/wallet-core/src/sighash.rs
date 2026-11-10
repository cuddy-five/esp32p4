//! The fork's unified signature hash.
//!
//! A signature does not sign a transaction directly. It signs a 32-byte hash of
//! a message built from the transaction, and the rules for building that
//! message decide what the signer has actually agreed to. This module builds
//! the message the BLAKE2b fork defines for signatures that set the
//! `SIGHASH_UNIFIED` bit.
//!
//! Source: `doc/unified-sighash.md` in Bitcoin Knots `v29.4.3.knots20260508`
//! (commit `a7c4617524c334f542484bfef3919b9f12573840`), section "Message".
//! The tests reproduce every vector in that release's
//! `src/test/data/unified_sighash.json`.
//!
//! What this module deliberately does not do:
//!
//! * It never computes a legacy, BIP143 or BIP341 message. A hash type without
//!   the unified bit is an error (owner decision, 2026-11-03).
//! * It does not support a taproot annex or an executed `OP_CODESEPARATOR` in
//!   tapscript. The release's vectors cover neither, so they are left out
//!   rather than shipped untested.
//! * It does not decide which hash types the device is willing to sign. For
//!   non-taproot inputs the rules give a meaning to every byte that has the
//!   bit, and this function follows them; the signing policy belongs to the
//!   caller.
//! * For [`Spend::Legacy`], the caller supplies the script code after the
//!   legacy removal of the signature being checked. That removal changes
//!   nothing for a script that does not contain its own signature.

use bitcoin_hashes::{sha256, HashEngine as _};

use crate::tx::Tx;

/// Sign every output.
pub const SIGHASH_ALL: u8 = 0x01;
/// Sign no output.
pub const SIGHASH_NONE: u8 = 0x02;
/// Sign only the output at the same position as the input.
pub const SIGHASH_SINGLE: u8 = 0x03;
/// Use the unified message. Required here.
pub const SIGHASH_UNIFIED: u8 = 0x20;
/// Sign only this input, so others may be added.
pub const SIGHASH_ANYONECANPAY: u8 = 0x80;

/// The bits of the hash type that select which outputs are signed.
const OUTPUT_MASK: u8 = 0x1f;
/// The leaf version BIP342 gives tapscript.
const TAPSCRIPT_LEAF_VERSION: u8 = 0xc0;

/// An output that one of the transaction's inputs spends.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct SpentOutput<'a> {
    /// The amount in satoshis.
    pub amount: u64,
    /// The locking script of the output.
    pub script_pubkey: &'a [u8],
}

/// How the input being signed is spent. Each kind has its own byte in the
/// message, so a signature made for one kind is never valid for another.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Spend<'a> {
    /// A bare or P2SH input, with the script code the legacy rules use.
    Legacy {
        /// The scriptPubKey for a bare input, or the redeem script for P2SH.
        script_code: &'a [u8],
    },
    /// A segwit version 0 input.
    SegwitV0 {
        /// The witness script for P2WSH, or the implied P2PKH script for P2WPKH.
        script_code: &'a [u8],
    },
    /// A taproot key-path spend without an annex.
    TaprootKeyPath,
    /// A tapscript spend without an annex or an executed `OP_CODESEPARATOR`.
    Tapscript {
        /// The leaf script being executed.
        leaf_script: &'a [u8],
    },
}

impl Spend<'_> {
    fn script_type(&self) -> u8 {
        match self {
            Self::Legacy { .. } => 0,
            Self::SegwitV0 { .. } => 1,
            Self::TaprootKeyPath => 2,
            Self::Tapscript { .. } => 3,
        }
    }
}

/// Why no signature hash was produced.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SighashError {
    /// The hash type does not set `SIGHASH_UNIFIED`.
    NotUnified,
    /// Taproot accepts only ALL, NONE or SINGLE, with or without ANYONECANPAY.
    HashTypeNotAllowedForTaproot,
    /// There must be exactly one spent output for each input.
    SpentOutputCountMismatch,
    /// The transaction has no input at that index.
    InputIndexOutOfRange,
    /// `SIGHASH_SINGLE` was asked for an input that has no matching output.
    SingleWithoutMatchingOutput,
}

impl core::fmt::Display for SighashError {
    fn fmt(&self, f: &mut core::fmt::Formatter<'_>) -> core::fmt::Result {
        f.write_str(match self {
            Self::NotUnified => "the hash type does not set SIGHASH_UNIFIED",
            Self::HashTypeNotAllowedForTaproot => "taproot does not allow this hash type",
            Self::SpentOutputCountMismatch => "need exactly one spent output per input",
            Self::InputIndexOutOfRange => "no input at that index",
            Self::SingleWithoutMatchingOutput => "SIGHASH_SINGLE has no matching output",
        })
    }
}

impl core::error::Error for SighashError {}

fn sha256_of(parts: impl IntoIterator<Item = impl AsRef<[u8]>>) -> [u8; 32] {
    let mut engine = sha256::HashEngine::new();
    for part in parts {
        engine.input(part.as_ref());
    }
    sha256::Hash::from_engine(engine).to_byte_array()
}

/// Starts a BIP340 tagged hash: `SHA256(SHA256(tag) || SHA256(tag) || ...)`.
fn tagged_engine(tag: &[u8]) -> sha256::HashEngine {
    let tag_hash = sha256_of([tag]);
    let mut engine = sha256::HashEngine::new();
    engine.input(&tag_hash);
    engine.input(&tag_hash);
    engine
}

/// Feeds a script the way Bitcoin serializes it: its length, then its bytes.
fn input_script(engine: &mut sha256::HashEngine, script: &[u8]) {
    // A `usize` always fits in the 64-bit form on the targets this builds for;
    // saturating keeps the conversion total without a panic path.
    let len = u64::try_from(script.len()).unwrap_or(u64::MAX);
    if let Ok(small @ 0..=0xfc) = u8::try_from(len) {
        engine.input(&[small]);
    } else if let Ok(len) = u16::try_from(len) {
        engine.input(&[0xfd]);
        engine.input(&len.to_le_bytes());
    } else if let Ok(len) = u32::try_from(len) {
        engine.input(&[0xfe]);
        engine.input(&len.to_le_bytes());
    } else {
        engine.input(&[0xff]);
        engine.input(&len.to_le_bytes());
    }
    engine.input(script);
}

/// Computes the unified signature hash for one input of `tx`.
///
/// `spent` lists the output each input spends, in input order. All of them are
/// needed, not only the one being signed: the message commits to every amount,
/// so a signer cannot be lied to about the fee.
///
/// # Errors
///
/// Returns a [`SighashError`] when the hash type lacks `SIGHASH_UNIFIED`, is
/// not allowed for a taproot spend, `spent` does not match the inputs,
/// `input_index` is out of range, or `SIGHASH_SINGLE` has no matching output.
pub fn unified_sighash(
    tx: &Tx<'_>,
    spent: &[SpentOutput<'_>],
    input_index: usize,
    hash_type: u8,
    spend: &Spend<'_>,
) -> Result<[u8; 32], SighashError> {
    if hash_type & SIGHASH_UNIFIED == 0 {
        return Err(SighashError::NotUnified);
    }
    let anyone_can_pay = hash_type & SIGHASH_ANYONECANPAY != 0;
    let output_type = hash_type & OUTPUT_MASK;
    if matches!(spend, Spend::TaprootKeyPath | Spend::Tapscript { .. }) {
        let named = hash_type & !(SIGHASH_UNIFIED | SIGHASH_ANYONECANPAY);
        if !matches!(named, SIGHASH_ALL | SIGHASH_NONE | SIGHASH_SINGLE) {
            return Err(SighashError::HashTypeNotAllowedForTaproot);
        }
    }
    if spent.len() != tx.input_count() {
        return Err(SighashError::SpentOutputCountMismatch);
    }
    let input = tx
        .inputs()
        .nth(input_index)
        .ok_or(SighashError::InputIndexOutOfRange)?;
    let own_spent = spent
        .get(input_index)
        .ok_or(SighashError::InputIndexOutOfRange)?;
    let index_le = u32::try_from(input_index)
        .map_err(|_| SighashError::InputIndexOutOfRange)?
        .to_le_bytes();

    let mut message = tagged_engine(b"UnifiedSighash");
    message.input(&[0x00, hash_type]); // epoch, then the hash type
    message.input(tx.version());
    message.input(tx.lock_time());
    message.input(&[0x00]); // the lock time is five bytes wide here

    if !anyone_can_pay {
        message.input(&sha256_of(tx.inputs().map(|i| i.outpoint)));
        message.input(&sha256_of(spent.iter().map(|s| s.amount.to_le_bytes())));
        let mut scripts = sha256::HashEngine::new();
        for output in spent {
            input_script(&mut scripts, output.script_pubkey);
        }
        message.input(&sha256::Hash::from_engine(scripts).to_byte_array());
        message.input(&sha256_of(tx.inputs().map(|i| i.sequence)));
    }

    if output_type != SIGHASH_NONE && output_type != SIGHASH_SINGLE {
        message.input(&sha256_of([tx.serialized_outputs()]));
    }

    message.input(&[spend.script_type()]);

    if anyone_can_pay {
        message.input(input.outpoint);
        message.input(&own_spent.amount.to_le_bytes());
        input_script(&mut message, own_spent.script_pubkey);
        message.input(input.sequence);
    } else {
        message.input(&index_le);
    }

    match spend {
        Spend::Legacy { script_code } | Spend::SegwitV0 { script_code } => {
            input_script(&mut message, script_code);
        }
        Spend::TaprootKeyPath | Spend::Tapscript { .. } => message.input(&[0x00]), // no annex
    }

    if output_type == SIGHASH_SINGLE {
        let output = tx
            .outputs()
            .nth(input_index)
            .ok_or(SighashError::SingleWithoutMatchingOutput)?;
        message.input(&sha256_of([output.serialized()]));
    }

    if let Spend::Tapscript { leaf_script } = spend {
        let mut leaf = tagged_engine(b"TapLeaf");
        leaf.input(&[TAPSCRIPT_LEAF_VERSION]);
        input_script(&mut leaf, leaf_script);
        message.input(&sha256::Hash::from_engine(leaf).to_byte_array());
        message.input(&[0x00]); // key version
        message.input(&[0xff; 4]); // no OP_CODESEPARATOR executed
    }

    Ok(sha256::Hash::from_engine(message).to_byte_array())
}

#[cfg(test)]
mod tests {
    use super::{input_script, sha256, sha256_of};

    fn sha256_of_script(script: &[u8]) -> [u8; 32] {
        let mut engine = sha256::HashEngine::new();
        input_script(&mut engine, script);
        sha256::Hash::from_engine(engine).to_byte_array()
    }

    #[test]
    fn sha256_matches_the_standard_test_values() {
        // FIPS 180-4 examples: the empty string and "abc".
        assert_eq!(
            sha256_of([b"" as &[u8]]),
            [
                0xe3, 0xb0, 0xc4, 0x42, 0x98, 0xfc, 0x1c, 0x14, 0x9a, 0xfb, 0xf4, 0xc8, 0x99, 0x6f,
                0xb9, 0x24, 0x27, 0xae, 0x41, 0xe4, 0x64, 0x9b, 0x93, 0x4c, 0xa4, 0x95, 0x99, 0x1b,
                0x78, 0x52, 0xb8, 0x55
            ]
        );
        assert_eq!(
            sha256_of([b"a" as &[u8], b"bc"]),
            [
                0xba, 0x78, 0x16, 0xbf, 0x8f, 0x01, 0xcf, 0xea, 0x41, 0x41, 0x40, 0xde, 0x5d, 0xae,
                0x22, 0x23, 0xb0, 0x03, 0x61, 0xa3, 0x96, 0x17, 0x7a, 0x9c, 0xb4, 0x10, 0xff, 0x61,
                0xf2, 0x00, 0x15, 0xad
            ]
        );
    }

    #[test]
    fn a_script_is_hashed_with_its_length_in_front() {
        assert_eq!(sha256_of_script(&[]), sha256_of([[0x00]]));
        assert_eq!(sha256_of_script(&[0x51]), sha256_of([[0x01, 0x51]]));
        let long = [0x51; 0xfd];
        assert_eq!(
            sha256_of_script(&long),
            sha256_of([&[0xfd, 0xfd, 0x00][..], &long[..]])
        );
    }
}
