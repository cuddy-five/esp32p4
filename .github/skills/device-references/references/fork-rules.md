# The intended fork: BLAKE2b proof of work and the unified sighash

**Status: the unified-sighash signing rules are reviewed and independently
reproduced (2026-11-03). The owner decided on 2026-11-03 that the device signs
only with the unified sighash; the RDTS question is deferred to
[#21](https://github.com/cuddy-five/esp32p4/issues/21) (see the end). The
specification is a draft and can change: pin every later release separately.**

`PROJECT.md` says the device targets "Blake2b and UNIFIED_SIGHASH". The fork is
the BLAKE2b chain implemented by Bitcoin Knots.

## Primary source

**Bitcoin Knots `v29.4.3.knots20260508`**, the official release published
2026-10-28 from branch `29.x-knots`, at commit
`a7c4617524c334f542484bfef3919b9f12573840`:
https://github.com/bitcoinknots/bitcoin/tree/a7c4617524c334f542484bfef3919b9f12573840.
The tag is signed with Luke Dashjr's code-signing key (checked with
`git verify-tag` on 2026-11-02). Everything below was read from a local checkout
of that commit. Line numbers refer to it. Git blob hashes:
`doc/unified-sighash.md` `cb55138f`, `src/script/interpreter.cpp` `6644f7ab`,
`src/test/data/unified_sighash.json` `7f6c9685`.

## How this was checked

1. `doc/unified-sighash.md` (586 lines, "Status: draft") was read in full.
2. `SignatureHashUnified` (`src/script/interpreter.cpp:1635-1754`) and its two
   callers (`:1873`, `:1917`) were compared with the document field by field.
   They agree.
3. A third implementation was written from the document alone:
   [`scripts/unified_sighash_check.py`](../scripts/unified_sighash_check.py).
   It reproduces **all 166** vectors in `src/test/data/unified_sighash.json`
   (76 bare/P2SH, 66 segwit v0, 12 taproot key path, 12 tapscript), across the
   hash types `0x20`-`0x26`, `0x3f`, `0x60`, `0xa0`-`0xa5`, `0xbf`, `0xe0` and
   `0xff`.

Agreement shows the document describes the code. It does not show the design is
sound: the document notes that all its implementations share one author.

## Facts

| Fact | Status | Evidence |
| --- | --- | --- |
| Specified in `doc/unified-sighash.md`, marked "Status: draft". No BIP exists. | Verified | `doc/unified-sighash.md:15-19` |
| Opt-in per signature with the hash type bit `SIGHASH_UNIFIED = 0x20`. It combines with `ALL` (`0x01`), `NONE` (`0x02`), `SINGLE` (`0x03`) and `ANYONECANPAY` (`0x80`), for example `ALL\|UNIFIED` = `0x21`. | Verified | `doc/unified-sighash.md:100-110`; `src/script/interpreter.h:41`; `src/core_read.cpp:250-255` |
| Enforced from block height `Blake2bHeight` (mainnet 961640), the same height as the BLAKE2b proof of work. Before it, an opted-in signature is invalid. | Verified | `doc/unified-sighash.md:76-96`; `src/kernel/chainparams.cpp:129` |
| Signers opt in wherever the fork is scheduled; they never ask the chain height. An offline signer therefore always opts in. | Verified (as the specification states it) | `doc/unified-sighash.md:458-470` |
| Signature hash = BIP340 tagged hash `SHA256(SHA256("UnifiedSighash") ‖ SHA256("UnifiedSighash") ‖ message)`. | Verified | `doc/unified-sighash.md:166-169`; `interpreter.cpp:1491`; reproduced |
| Message: epoch `0x00`; hash type (1 byte); version (4 bytes LE); locktime (4 bytes LE) **plus one zero byte**; then, unless `ANYONECANPAY`, the single-SHA256 aggregates of all prevouts, all spent amounts, all spent scriptPubKeys and all sequences; then, unless the low five bits are `NONE` or `SINGLE`, the SHA256 of all outputs; then a script type byte (0 bare/P2SH, 1 segwit v0, 2 taproot key path, 3 tapscript); then the input's own outpoint, spent output and sequence under `ANYONECANPAY`, otherwise its index (4 bytes LE); then the scriptCode (types 0, 1) or the annex flag and hash (types 2, 3); for `SINGLE`, the SHA256 of the output at the input's index; for type 3, the tapleaf hash, key version `0x00` and code-separator position. | Verified | `doc/unified-sighash.md:151-213`; `interpreter.cpp:1667-1752`; reproduced |
| The signer needs **every input's spent output** (amount and scriptPubKey), not just the one being signed. PSBT carries these per input. This is what closes CVE-2020-14199. | Verified | `doc/unified-sighash.md:270-286`; the vectors need `spentOutputs` for every input |
| Signatures themselves are unchanged: ECDSA over secp256k1 for script types 0 and 1, BIP340 Schnorr for 2 and 3. Only the message differs. A signer without taproot implements types 0 and 1 only. | Verified | `doc/unified-sighash.md:272-281`; `interpreter.cpp:1882-1886` |
| `SIGHASH_SINGLE` with no output at the input's index is **invalid** (the legacy "hash of 1" is not carried over). | Verified | `doc/unified-sighash.md:243-246`; `interpreter.cpp:1737` |
| `NONE` and `SINGLE` still commit to every input's `nSequence`. | Verified | `doc/unified-sighash.md:251-254` |
| Bare/P2SH/segwit v0 keep the legacy reading of the byte: any low-five-bits value other than `NONE`/`SINGLE` signs all outputs. Taproot accepts only `ALL`, `NONE`, `SINGLE` (with or without `ANYONECANPAY`) plus the bit; `SIGHASH_DEFAULT` cannot opt in, so opted-in taproot signatures are 65 bytes. | Verified | `doc/unified-sighash.md:112-131, 308-312`; `interpreter.cpp:1660-1664` |
| For script type 0, the legacy removal of the signature from the scriptCode (`FindAndDelete`) still runs before hashing. Type 1 does not do it. | Verified | `doc/unified-sighash.md:229-235`; `interpreter.cpp:343-347` |
| Message signing (BIP137-style) stays legacy. | Verified | `doc/unified-sighash.md:486-488` |
| Mainnet addresses and keys are unchanged: bech32 HRP `bc`, P2PKH prefix `0x00`, xpub `0x0488B21E`. | Verified | `src/kernel/chainparams.cpp:197-203` |
| **BLAKE2b is used only to hash v2 block headers for proof of work.** Transactions, scripts, sighashes and addresses do not use it, so a signer that does not check headers needs no BLAKE2b. | Verified | `blake2b_nokey` is called only in `src/primitives/block.cpp:73,96`; no use in `src/script`, `src/primitives/transaction.cpp`, PSBT or address code |
| BLAKE2b proof of work activates at height 961640 with `Blake2bTargetShift` 22. | Verified | `src/kernel/chainparams.cpp:129-135`; `src/pow.cpp:19-26` |
| **BIP-110 "ReducedData" (RDTS) rules also apply** from `Blake2bHeight` until the parent block's median-time-past reaches 2027-09-01 00:00 UTC. A transaction that breaks them cannot be mined in that window. | Verified (location) | `src/kernel/chainparams.cpp:136-141`; `doc/bips.md:37`. The rules themselves are **not reviewed**. |
| 17 confirmed mainnet signatures already set the bit under the legacy rules (`0x21`, `0x65`, heights 505,057-509,793). Pre-signed transactions with such bytes become unspendable after activation. | Verified (as the specification states it) | `doc/unified-sighash.md:405-411` |
| The project documents' "UNIFIED_SIGHASH" refers to this scheme. | Inferred | The names match, and the owner's 2026-11-03 signing decision names this scheme (hash-type bit `0x20`). |
| How BLAKE2b hashes a v2 header (XOR key, merge-mining fields, nonces) | Verified (location), not reviewed | `src/primitives/block.cpp:15-100`. Needed only if the device ever checks headers. |

## Gaps in the specification

- It says "tapleaf hash, as BIP341 defines it" but does not state the leaf
  version. The vectors match with `0xc0` (BIP342 tapscript), which
  `test/functional/test_framework/script.py:34` also uses.
- The vectors cover no annex, no executed `OP_CODESEPARATOR` and no
  `SINGLE`-without-output case. Device tests must add those cases from the
  Knots unit tests (`src/test/sighash_tests.cpp`, `src/test/fuzz/unified_sighash.cpp`)
  or from the rules above.

## For device code and review

- Compute the message only from data the device checked. Every spent output
  must come from the PSBT and be shown to, or bounded for, the user. A wrong
  amount for any input changes the fee the user approves.
- Refuse `SINGLE` when the input index has no output; never fall back to a
  legacy behaviour.
- Take test vectors from `src/test/data/unified_sighash.json` at the pinned
  commit, never from a summary. Re-run
  [`scripts/unified_sighash_check.py`](../scripts/unified_sighash_check.py)
  against any new Knots release before moving to it.

## Owner decisions

1. **Unified only (decided 2026-11-03).** The device never signs a legacy,
   BIP143 or BIP341 sighash message and has no setting to. BIP174 says a signer
   "must fail" on a requested sighash type it finds unacceptable
   (`bip-0174.mediawiki:435` in `bitcoin/bips` at `ada3419`), so the device
   refuses a PSBT input whose sighash type lacks the bit.
2. **RDTS limits: deferred (2026-11-03)** to
   [#21](https://github.com/cuddy-five/esp32p4/issues/21). Review BIP-110 at a
   pinned commit before deciding.

News coverage of the fork, for example
https://www.kucoin.com/news/flash/bip-110-bitcoin-hard-fork-chain-confirms-blake2b-as-new-pow-algorithm,
is context only. BIP-110 in `bitcoin/bips` is "Reduced Data Temporary
Softfork" (status Closed): it does not specify the BLAKE2b proof of work, but
Knots applies its rules from the fork height.
