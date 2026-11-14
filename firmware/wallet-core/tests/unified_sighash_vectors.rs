//! Checks the unified signature hash against Bitcoin Knots' own test vectors,
//! and checks that malformed input is refused without a panic.
//!
//! Tests may unwrap, index and do plain arithmetic; library code may not.
#![allow(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::indexing_slicing,
    clippy::panic,
    clippy::arithmetic_side_effects
)]

use bitcoin_hashes::sha256;
use wallet_core::sighash::{unified_sighash, SighashError, Spend, SpentOutput};
use wallet_core::tx::{Tx, TxError};

const FIXTURE: &str = include_str!("data/unified_sighash.json");
const FIXTURE_SHA256: &str = "5c5e95fc1ab8ef9ce6b3cb6e76b8c74a987d182ebd01d8e2b98b6d0fbb26f630";

/// The little of JSON the fixture uses: arrays, strings without escapes and
/// non-negative whole numbers.
#[derive(Debug)]
enum Json {
    Array(Vec<Json>),
    Text(String),
    Number(u64),
}

impl Json {
    fn array(&self) -> &[Json] {
        match self {
            Json::Array(items) => items,
            other => panic!("expected an array, found {other:?}"),
        }
    }

    fn text(&self) -> &str {
        match self {
            Json::Text(text) => text,
            other => panic!("expected a string, found {other:?}"),
        }
    }

    fn number(&self) -> u64 {
        match self {
            Json::Number(number) => *number,
            other => panic!("expected a number, found {other:?}"),
        }
    }
}

fn parse_json(text: &str) -> Json {
    fn skip_space(bytes: &[u8], at: &mut usize) {
        while bytes.get(*at).is_some_and(u8::is_ascii_whitespace) {
            *at += 1;
        }
    }

    fn value(bytes: &[u8], at: &mut usize) -> Json {
        skip_space(bytes, at);
        match bytes[*at] {
            b'[' => {
                *at += 1;
                let mut items = Vec::new();
                loop {
                    skip_space(bytes, at);
                    if bytes[*at] == b']' {
                        *at += 1;
                        return Json::Array(items);
                    }
                    if !items.is_empty() {
                        assert_eq!(bytes[*at], b',', "expected a comma at byte {at}");
                        *at += 1;
                    }
                    items.push(value(bytes, at));
                }
            }
            b'"' => {
                *at += 1;
                let start = *at;
                while bytes[*at] != b'"' {
                    assert_ne!(bytes[*at], b'\\', "escapes are not expected in the fixture");
                    *at += 1;
                }
                let text = core::str::from_utf8(&bytes[start..*at]).unwrap().to_owned();
                *at += 1;
                Json::Text(text)
            }
            b'0'..=b'9' => {
                let start = *at;
                while bytes.get(*at).is_some_and(u8::is_ascii_digit) {
                    *at += 1;
                }
                Json::Number(
                    core::str::from_utf8(&bytes[start..*at])
                        .unwrap()
                        .parse()
                        .unwrap(),
                )
            }
            other => panic!("unexpected byte {other:#x} at {at}"),
        }
    }

    let bytes = text.as_bytes();
    let mut at = 0;
    let parsed = value(bytes, &mut at);
    skip_space(bytes, &mut at);
    assert_eq!(at, bytes.len(), "text after the JSON value");
    parsed
}

fn unhex(text: &str) -> Vec<u8> {
    assert_eq!(text.len() % 2, 0, "odd number of hex digits");
    (0..text.len())
        .step_by(2)
        .map(|i| u8::from_str_radix(&text[i..i + 2], 16).unwrap())
        .collect()
}

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

struct Vector {
    script_code: Vec<u8>,
    raw_tx: Vec<u8>,
    input_index: usize,
    hash_type: u8,
    script_type: u64,
    spent: Vec<(u64, Vec<u8>)>,
    expected: String,
}

impl Vector {
    fn spend(&self) -> Spend<'_> {
        match self.script_type {
            0 => Spend::Legacy {
                script_code: &self.script_code,
            },
            1 => Spend::SegwitV0 {
                script_code: &self.script_code,
            },
            2 => Spend::TaprootKeyPath,
            3 => Spend::Tapscript {
                leaf_script: &self.script_code,
            },
            other => panic!("unknown script type {other}"),
        }
    }

    fn spent(&self) -> Vec<SpentOutput<'_>> {
        self.spent
            .iter()
            .map(|(amount, script)| SpentOutput {
                amount: *amount,
                script_pubkey: script,
            })
            .collect()
    }

    fn sighash(&self, hash_type: u8) -> Result<[u8; 32], SighashError> {
        let tx = Tx::parse(&self.raw_tx).expect("the vector's transaction parses");
        unified_sighash(
            &tx,
            &self.spent(),
            self.input_index,
            hash_type,
            &self.spend(),
        )
    }
}

fn vectors() -> Vec<Vector> {
    let document = parse_json(FIXTURE);
    let rows = document.array();
    let header: Vec<&str> = rows[0].array().iter().map(Json::text).collect();
    assert_eq!(
        header,
        [
            "scriptCode",
            "rawTx",
            "inIdx",
            "hashType",
            "scriptType",
            "spentOutputs",
            "sighash"
        ]
    );
    rows[1..]
        .iter()
        .map(|row| {
            let row = row.array();
            assert_eq!(row.len(), 7);
            Vector {
                script_code: unhex(row[0].text()),
                raw_tx: unhex(row[1].text()),
                input_index: usize::try_from(row[2].number()).unwrap(),
                hash_type: u8::try_from(row[3].number()).unwrap(),
                script_type: row[4].number(),
                spent: row[5]
                    .array()
                    .iter()
                    .map(|pair| (pair.array()[0].number(), unhex(pair.array()[1].text())))
                    .collect(),
                expected: row[6].text().to_owned(),
            }
        })
        .collect()
}

#[test]
fn the_fixture_is_the_pinned_knots_file() {
    let digest = sha256::Hash::hash(FIXTURE.as_bytes()).to_byte_array();
    assert_eq!(hex(&digest), FIXTURE_SHA256);
}

#[test]
fn every_knots_vector_is_reproduced() {
    let vectors = vectors();
    assert_eq!(vectors.len(), 166, "the pinned release has 166 vectors");
    let mut per_script_type = [0_usize; 4];
    for (number, vector) in vectors.iter().enumerate() {
        let got = vector.sighash(vector.hash_type).unwrap_or_else(|error| {
            panic!("vector {number}: {error}");
        });
        assert_eq!(hex(&got), vector.expected, "vector {number}");
        per_script_type[usize::try_from(vector.script_type).unwrap()] += 1;
    }
    assert_eq!(per_script_type, [76, 66, 12, 12], "vectors per script type");
}

#[test]
fn a_hash_type_without_the_unified_bit_is_refused() {
    for vector in vectors() {
        for legacy in [0x00, 0x01, 0x02, 0x03, 0x81, 0x83, vector.hash_type & !0x20] {
            assert_eq!(vector.sighash(legacy), Err(SighashError::NotUnified));
        }
    }
}

#[test]
fn taproot_accepts_only_the_six_named_hash_types() {
    let allowed = [0x21, 0x22, 0x23, 0xa1, 0xa2, 0xa3];
    for vector in vectors().iter().filter(|vector| vector.script_type >= 2) {
        for hash_type in (0..=u8::MAX).filter(|hash_type| hash_type & 0x20 != 0) {
            let result = vector.sighash(hash_type);
            if allowed.contains(&hash_type) {
                assert_ne!(result, Err(SighashError::HashTypeNotAllowedForTaproot));
            } else {
                assert_eq!(result, Err(SighashError::HashTypeNotAllowedForTaproot));
            }
        }
    }
}

#[test]
fn single_without_a_matching_output_is_refused() {
    let mut checked = 0;
    for vector in vectors() {
        let tx = Tx::parse(&vector.raw_tx).unwrap();
        for input_index in tx.output_count()..tx.input_count() {
            for hash_type in [0x23, 0xa3] {
                let result = unified_sighash(
                    &tx,
                    &vector.spent(),
                    input_index,
                    hash_type,
                    &vector.spend(),
                );
                assert_eq!(result, Err(SighashError::SingleWithoutMatchingOutput));
                checked += 1;
            }
        }
    }
    assert!(
        checked > 0,
        "the vectors include inputs without a matching output"
    );
}

#[test]
fn the_spent_outputs_must_match_the_inputs() {
    for vector in vectors() {
        let tx = Tx::parse(&vector.raw_tx).unwrap();
        let spend = vector.spend();
        let mut spent = vector.spent();
        let beyond = tx.input_count();
        assert_eq!(
            unified_sighash(&tx, &spent, beyond, 0x21, &spend),
            Err(SighashError::InputIndexOutOfRange)
        );
        spent.push(SpentOutput {
            amount: 1,
            script_pubkey: &[],
        });
        assert_eq!(
            unified_sighash(&tx, &spent, vector.input_index, 0x21, &spend),
            Err(SighashError::SpentOutputCountMismatch)
        );
        spent.truncate(tx.input_count() - 1);
        assert_eq!(
            unified_sighash(&tx, &spent, vector.input_index, 0x21, &spend),
            Err(SighashError::SpentOutputCountMismatch)
        );
    }
}

/// The reason every spent output is required: a wrong amount for any input
/// would change the fee the user approves, so it must change the hash.
#[test]
fn changing_any_spent_amount_changes_the_hash() {
    let mut checked = 0;
    for vector in vectors() {
        let tx = Tx::parse(&vector.raw_tx).unwrap();
        let spend = vector.spend();
        let honest = unified_sighash(&tx, &vector.spent(), vector.input_index, 0x21, &spend);
        for lied_about in 0..tx.input_count() {
            let mut spent = vector.spent();
            spent[lied_about].amount += 1;
            let lied = unified_sighash(&tx, &spent, vector.input_index, 0x21, &spend);
            assert_ne!(honest.unwrap(), lied.unwrap(), "input {lied_about}");
            checked += 1;
        }
    }
    assert!(checked > 166);
}

#[test]
fn a_signature_for_one_script_type_is_not_valid_for_another() {
    let vector = &vectors()[0];
    let tx = Tx::parse(&vector.raw_tx).unwrap();
    let code = &vector.script_code[..];
    let spends = [
        Spend::Legacy { script_code: code },
        Spend::SegwitV0 { script_code: code },
        Spend::TaprootKeyPath,
        Spend::Tapscript { leaf_script: code },
    ];
    let hashes: Vec<[u8; 32]> = spends
        .iter()
        .map(|spend| unified_sighash(&tx, &vector.spent(), vector.input_index, 0x21, spend))
        .map(Result::unwrap)
        .collect();
    for (i, left) in hashes.iter().enumerate() {
        for right in &hashes[i + 1..] {
            assert_ne!(left, right);
        }
    }
}

#[test]
fn the_parser_reads_back_what_the_vectors_contain() {
    for vector in vectors() {
        let tx = Tx::parse(&vector.raw_tx).unwrap();
        assert_eq!(tx.inputs().count(), tx.input_count());
        assert_eq!(tx.outputs().count(), tx.output_count());
        assert_eq!(tx.input_count(), vector.spent.len());
        let outputs: Vec<u8> = tx
            .outputs()
            .flat_map(|output| output.serialized().iter().copied())
            .collect();
        assert_eq!(outputs, tx.serialized_outputs());
        for output in tx.outputs() {
            assert_eq!(output.amount().to_le_bytes(), output.serialized()[..8]);
            assert!(output.serialized().ends_with(output.script_pubkey));
        }
    }
}

#[test]
fn every_truncation_and_extension_of_a_transaction_is_refused() {
    for vector in vectors() {
        let raw = &vector.raw_tx;
        for len in 0..raw.len() {
            assert!(
                Tx::parse(&raw[..len]).is_err(),
                "a {len}-byte prefix was accepted"
            );
        }
        let mut longer = raw.clone();
        longer.push(0);
        assert_eq!(Tx::parse(&longer), Err(TxError::TrailingBytes));
    }
}

#[test]
fn witness_serialization_and_empty_input_lists_are_refused() {
    // version, zero inputs, zero outputs, lock time
    let no_inputs = [1, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    assert_eq!(Tx::parse(&no_inputs), Err(TxError::NoInputsOrWitnessFormat));
    // version, segwit marker 0x00, flag 0x01, ...
    let witness_format = [2, 0, 0, 0, 0, 1, 1];
    assert_eq!(
        Tx::parse(&witness_format),
        Err(TxError::NoInputsOrWitnessFormat)
    );
}

#[test]
fn a_huge_declared_count_fails_fast_instead_of_looping() {
    // version, then an input count of 0x02000000 with no inputs behind it
    let raw = [1, 0, 0, 0, 0xfe, 0x00, 0x00, 0x00, 0x02];
    assert_eq!(Tx::parse(&raw), Err(TxError::Truncated));
}

/// Hostile input: random bytes and randomly damaged transactions must give an
/// answer, never a panic. The generator is fixed so a failure can be repeated.
#[test]
fn random_and_damaged_bytes_never_panic() {
    let mut state = 0x9e37_79b9_7f4a_7c15_u64;
    let mut next = move || {
        state ^= state << 13;
        state ^= state >> 7;
        state ^= state << 17;
        state
    };
    let vectors = vectors();
    for round in 0..200_000_u32 {
        let vector = &vectors[round as usize % vectors.len()];
        let mut bytes = vector.raw_tx.clone();
        if round % 4 == 0 {
            bytes = (0..next() % 300).map(|_| next() as u8).collect();
        } else {
            for _ in 0..=(next() % 3) {
                let at = next() as usize % bytes.len();
                bytes[at] = next() as u8;
            }
        }
        if let Ok(tx) = Tx::parse(&bytes) {
            assert_eq!(tx.inputs().count(), tx.input_count());
            assert_eq!(tx.outputs().count(), tx.output_count());
            let spent: Vec<SpentOutput<'_>> = (0..tx.input_count())
                .map(|_| SpentOutput {
                    amount: next(),
                    script_pubkey: &vector.script_code,
                })
                .collect();
            let hash_type = next() as u8;
            let index = next() as usize % (tx.input_count() + 1);
            let _ = unified_sighash(&tx, &spent, index, hash_type, &vector.spend());
        }
    }
}
