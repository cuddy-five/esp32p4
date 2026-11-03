# The intended fork: BLAKE2b proof of work and the unified sighash

**Status: reference implementation identified; its rules are not yet reviewed
for the device. Do not implement fork-specific signing until that review is done.**

`PROJECT.md` says the device targets "Blake2b and UNIFIED_SIGHASH". The fork is
the BLAKE2b chain implemented by Bitcoin Knots.

Checked 2026-11-03.

## Primary source

**Bitcoin Knots `v29.4.3.knots20260508`**, the official release published
2026-10-28 from branch `29.x-knots`, at commit
`a7c4617524c334f542484bfef3919b9f12573840`:
https://github.com/bitcoinknots/bitcoin/tree/a7c4617524c334f542484bfef3919b9f12573840.
The tag is signed with Luke Dashjr's code-signing key (checked with
`git verify-tag` on 2026-11-02). The facts below were read from a local checkout
of that commit, and the Git blob hashes of the cited files match GitHub's copies
at the same commit.

| Fact | Status | Evidence |
| --- | --- | --- |
| The unified signature hash is specified in `doc/unified-sighash.md` ("Unified opt-in signature hash", 586 lines), marked "Status: draft". No BIP exists; the document says the rules are recorded there "until that changes". | Verified | `doc/unified-sighash.md` |
| A signature opts in with the sighash type flag `SIGHASH_UNIFIED`, value `0x20`. | Verified | `src/script/interpreter.h:41` |
| Nodes enforce it under the script flag `SCRIPT_VERIFY_UNIFIED_SIGHASH` (`1U << 22`). | Verified | `src/script/interpreter.h:174` |
| The hash is a tagged hash with the tag `UnifiedSighash`. | Verified (location) | `HASHER_UNIFIED_SIGHASH` in `src/script/interpreter.cpp:1491` |
| The project documents' "UNIFIED_SIGHASH" refers to this scheme. | Inferred | It matches the Knots names above; confirm with the owner. |
| It combines with `ALL`, `NONE`, `SINGLE` and `ANYONECANPAY` (for example `ALL\|UNIFIED`). | Verified | `src/core_read.cpp:250-255` |
| The document says opting in also protects a transaction against replay onto any chain that does not implement it. | Verified (as the specification states it) | `doc/unified-sighash.md` |
| BLAKE2b proof of work activates on mainnet at height 961640, with `Blake2bTargetShift` 22 and a "headline" consensus parameter. | Verified | `src/kernel/chainparams.cpp:129-135`; fields in `src/consensus/params.h:138-141` |
| BLAKE2b implementation and test vectors | Verified (location) | `src/crypto/blake2b.{h,cpp}`; `blake2b_256_testvectors` in `src/test/crypto_tests.cpp:433` |
| Unified sighash tests | Verified (location) | `src/test/sighash_tests.cpp`, `src/test/fuzz/unified_sighash.cpp` |
| The exact serialization the unified hash commits to, and which inputs may use it | **Unverified** | Read the full `doc/unified-sighash.md` and `SignatureHash` in `src/script/interpreter.cpp` before relying on it. |
| How BLAKE2b hashes a block header (serialization, parameters, output length, target) | **Unverified** | Read the implementation and `src/test/data/block_header_v2.json`. The device may not need to check headers at all. |

GitHub code search did not find `SIGHASH_UNIFIED` in the `bitcoinknots`
organization. The local checkout and GitHub's file contents at the pinned commit
did.

## Before implementation

1. Review `doc/unified-sighash.md` in full and record the exact rules here, with
   line references at the pinned commit.
2. Take test vectors from the Knots tests at that commit, never from a summary.
3. Pin any later release separately; the specification is a draft and can change.
4. Decide whether the device signs only with the unified hash, also with the
   standard Bitcoin hashes, or both. That is an owner decision.

News coverage of the fork, for example
https://www.kucoin.com/news/flash/bip-110-bitcoin-hard-fork-chain-confirms-blake2b-as-new-pow-algorithm,
is context only. BIP-110 in `bitcoin/bips` is "Reduced Data Temporary
Softfork" (status Closed) and does not specify the BLAKE2b proof of work.
