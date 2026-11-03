# Bitcoin standards

The standard BIPs and RFCs a single-signature, PSBT-based signing device
depends on. Each one was checked on 2026-11-03 at `bitcoin/bips` commit
`ada341963ab3916e74c98e6de4ba48babc024a75`. Title and status are copied from
each BIP's header. The fork's own changes are in [fork-rules.md](fork-rules.md).

Base URL: `https://github.com/bitcoin/bips/blob/ada341963ab3916e74c98e6de4ba48babc024a75/`

| Standard | Title (status) | Test vectors |
| --- | --- | --- |
| BIP-32 | Hierarchical Deterministic Wallets (Deployed) | "Test Vectors" section in `bip-0032.mediawiki` |
| BIP-39 | Mnemonic code for generating deterministic keys (Deployed) | Section links to https://github.com/trezor/python-mnemonic/blob/master/vectors.json; wordlists in `bip-0039/` (use `english.txt`) |
| BIP-84 | Derivation scheme for P2WPKH based accounts (Deployed) | "Test vectors" section in `bip-0084.mediawiki` |
| BIP-86 | Key Derivation for Single Key P2TR Outputs (Deployed) | "Test vectors" section in `bip-0086.mediawiki` |
| BIP-141 | Segregated Witness (Consensus layer) (Deployed) | None in the BIP |
| BIP-143 | Transaction Signature Verification for Version 0 Witness Program (Deployed) | Worked examples ("Native P2WPKH", "P2SH-P2WPKH", and more) under "Example" |
| BIP-173 | Base32 address format for native v0-16 witness outputs (Deployed) | "Test vectors" section in `bip-0173.mediawiki` |
| BIP-350 | Bech32m format for v1+ witness addresses (Deployed) | "Test vectors" section in `bip-0350.mediawiki` |
| BIP-340 | Schnorr Signatures for secp256k1 (Deployed) | `bip-0340/test-vectors.csv`, with `reference.py` |
| BIP-341 | Taproot: SegWit version 1 spending rules (Deployed) | `bip-0341/wallet-test-vectors.json` |
| BIP-174 | Partially Signed Bitcoin Transaction Format (Deployed) | "Test Vectors" section in `bip-0174.mediawiki` |
| BIP-370 | PSBT Version 2 (Deployed) | "Test Vectors" section in `bip-0370.mediawiki` |
| RFC 6979 | Deterministic Usage of the Digital Signature Algorithm (DSA) and Elliptic Curve Digital Signature Algorithm (ECDSA) | Appendix A.2 (the curves there are not secp256k1; take secp256k1 vectors from an independent, reviewed source) |
| RFC 7693 | The BLAKE2 Cryptographic Hash and Message Authentication Code (MAC) | Appendix A (an example BLAKE2b computation); the RFC points to a full test-vector set |

RFC sources: https://www.rfc-editor.org/rfc/rfc6979.txt and
https://www.rfc-editor.org/rfc/rfc7693.txt.

## Notes

- Status "Deployed" is the BIP's own header. It describes Bitcoin, not the fork.
- The chip's hardware ECDSA does not support secp256k1 ([chip file](chip-esp32-p4.md)).
  ECDSA (with RFC 6979 nonces) and BIP-340 signing run in software.
- Choose the Rust libraries separately. Record each crate's version and its
  `no_std` support from its own documentation before relying on it; none is
  chosen yet.
