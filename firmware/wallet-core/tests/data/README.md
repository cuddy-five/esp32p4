# Test data

`unified_sighash.json` is copied unchanged from Bitcoin Knots
`v29.4.3.knots20260508`, commit `a7c4617524c334f542484bfef3919b9f12573840`,
path `src/test/data/unified_sighash.json`
(https://github.com/bitcoinknots/bitcoin/blob/a7c4617524c334f542484bfef3919b9f12573840/src/test/data/unified_sighash.json),
retrieved 2026-11-10.

- Git blob hash: `7f6c9685bf913cba28a334ff5b2bd1b447d44d56`, the hash recorded
  in the `device-references` skill (`references/fork-rules.md`). Check it with
  `git hash-object unified_sighash.json`.
- SHA-256: `5c5e95fc1ab8ef9ce6b3cb6e76b8c74a987d182ebd01d8e2b98b6d0fbb26f630`.
  The test `the_fixture_is_the_pinned_knots_file` fails if the file changes.
- License: MIT, copyright The Bitcoin Core developers and Bitcoin Developers
  (the `COPYING` file at that commit).

It holds 166 vectors: 76 bare or P2SH, 66 segwit v0, 12 taproot key path and
12 tapscript. None has an annex, an executed `OP_CODESEPARATOR`, or
`SIGHASH_SINGLE` without a matching output. Do not edit the file; to move to a
newer Knots release, replace it and update the hashes here and in the test.
