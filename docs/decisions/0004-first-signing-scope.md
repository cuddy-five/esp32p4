# ADR 0004: First signing scope

Status: proposed for owner review. Nothing below is decided until the owner
accepts it, and it permits no firmware work before that.
Date: 2026-11-14

## What the owner is asked to decide

Agents cannot write the signing code until the owner says what the device may
sign ([PROJECT.md](../../PROJECT.md), "Decisions still needed"). This record
proposes the smallest useful answer: **the first signer handles one ordinary
kind of payment and refuses everything else.** Accept it, change a row, or
reject it. Later scopes add to it one decision at a time.

How a payment reaches the signer: a computer running the fork's node software,
Bitcoin Knots, builds an unsigned transaction and hands it over in a file
format called a PSBT (BIP174). The device checks it, shows it, signs it and
hands it back. The computer never holds the keys.

## What exists and what was checked

- `firmware/wallet-core` reads a transaction and computes the fork's unified
  signature hash. It holds no key, signs nothing and sets no limit on what may
  be signed.
- Already decided: unified sighash only (2026-11-03), no stored secrets, no
  radio.
- Checked on 2026-11-14 in the pinned Knots release (the pin is in the
  [fork rules](../../.github/skills/device-references/references/fork-rules.md)):
  - Knots reads and writes PSBT version 0 only (`src/psbt.h:73`).
  - Knots sets an input's hash type in a PSBT only when it reads one or after
    it signs (`src/psbt.h:444`, `src/psbt.cpp:457`), so an unsigned PSBT that
    Knots creates declares none.
  - Its wallet makes P2WPKH addresses by default, from the key path `84h/0h/0h`
    on mainnet and `84h/1h/0h` on test chains (`src/wallet/wallet.h:149`,
    `src/wallet/walletutil.cpp:68-92`).
- No `no_std` Rust driver can read the board's camera
  ([chip reference](../../.github/skills/device-references/references/chip-esp32-p4.md#rust-no_std-support-esp-hal)).

BIP174 and BIP84 line numbers below refer to `bitcoin/bips` at `ada3419`, the
commit the [Bitcoin standards](../../.github/skills/device-references/references/bitcoin-standards.md)
sheet pins. Knots paths refer to the pinned release.

## Proposed scope

| # | Choice | Proposal | Why |
| --- | --- | --- | --- |
| 1 | Coins it spends | Only the device's own P2WPKH coins: the ordinary single-key address that starts `bc1q`. One signature per input. | It is Knots' default address type. It needs one signature algorithm (ECDSA), and 66 of the 166 pinned vectors are for its message type (segwit v0). Taproot, P2SH, legacy and multisig each need a later decision. |
| 2 | Keys | One seed, with BIP32 keys at the BIP84 path `m/84'/0'/0'/c/i`: `c` is 0 for receiving and 1 for change, and `i` is the address number, below 100,000. | BIP84:38-41, and the path Knots uses. The fork keeps Bitcoin's coin type `0'` and address format, so one seed controls the same addresses on both chains. The bound stops a computer from hiding change at a number no wallet scans. |
| 3 | File format | PSBT version 0 only. | Knots reads and writes nothing else. |
| 4 | Hash type: how much of the transaction a signature covers | Only `ALL\|UNIFIED` (`0x21`): every input and every output, under the fork's rules. An input that declares `0x21`, or declares nothing, is signed with `0x21`, and the device writes that type into the result. An input that declares anything else makes the device refuse the PSBT. | The owner's unified-only decision. BIP174:436 lets a signer use `ALL` when none is declared, and refusing would refuse every PSBT Knots creates. Every other type lets someone change the outputs or add inputs after the user approved. |
| 5 | All or nothing | The device signs every input or none. An input it cannot prove is its own (rows 1 and 2) makes it refuse the PSBT. | With every input its own, the device can tell the user exactly what leaves the wallet. Transactions shared with other signers come later. |
| 6 | Where it can pay | Any address of the five standard kinds: P2WPKH and P2WSH (`bc1q…`), P2TR (`bc1p…`), P2PKH (`1…`) and P2SH (`3…`). Any other output, a data output included, is refused. | The device must show the user every destination as an address. |
| 7 | Change: money the transaction returns to the wallet | An output is change only if the PSBT gives its key path, the path is on the change chain (`c` is 1), and the device derives that key itself and gets the same address. At most one. A change claim that fails the check makes the device refuse. Change is not shown as a payment. | BIP174:480-487. A false change claim is how a hostile computer would hide a payment. |
| 8 | Size limits | A PSBT of at most 65,536 bytes, with at most 16 inputs and 16 outputs, and at least one output. | Small enough to test just below, at and above each limit. Raising one is a reviewed change. |
| 9 | Money limits | Each amount and each total at most 21,000,000 coins. Outputs may not exceed inputs. The fee, inputs minus outputs, is at most 10,000,000 satoshis (0.1 coin). | Knots' `MAX_MONEY` (`src/consensus/amount.h:26`) and its wallet's default fee ceiling (`src/wallet/wallet.h:138`). The unified hash commits to every spent amount, so the fee the device computes is the fee paid. |
| 10 | What it returns | One ECDSA signature per input (RFC 6979 nonce, low S), added to the PSBT as a partial signature. The computer finalizes and broadcasts. | Knots relays only low-S signatures (`src/policy/policy.h:171`). Finalizing needs no key, so it stays off the device. |
| 11 | Network | Mainnet. A separate test build signs for regtest (`m/84'/1'/0'`, addresses `bcrt1…`). The network is fixed when the firmware is built. | Regtest is where Knots can check the device's signatures without real coins. |

## What the first signer refuses

Each line becomes tests: one case just inside the rule and one just outside. A
refusal names its reason, and the device then signs no input at all.

| The device refuses a PSBT that… | From |
| --- | --- |
| is malformed: wrong magic bytes, a duplicate key, no unsigned transaction, bytes left over, or a different number of input or output maps than the transaction has inputs or outputs | BIP174:57-61, 363, 390 |
| is not version 0, or is over a size limit | rows 3, 8 |
| carries an unsigned transaction with a non-empty `scriptSig` or no output | BIP174:102; row 8 |
| has an input without its spent output (`PSBT_IN_WITNESS_UTXO`), or whose spent output is not P2WPKH | BIP174:412; row 1 |
| has an input whose full previous transaction is present and does not match the input's outpoint and spent output | BIP174:431 |
| has an input whose key path is missing, names another seed, is off the path in row 2, or leads to a different key than the spent output names | rows 2, 5 |
| has an input that declares a hash type other than `0x21` | row 4 |
| has an input that is already signed or finalized, or that carries a script or taproot field | rows 1, 5 |
| has an output that is not one of the five address kinds | row 6 |
| has a failed change claim, or a second change output | row 7 |
| breaks a money limit | row 9 |
| is not the PSBT the user reviewed and approved: it changed afterwards, or the user cancelled | [wallet development](../runbooks/wallet-development.md), end-to-end row |

The device keeps a PSBT field of a type it does not know and passes it through
unchanged (BIP174:544-546).

## Not decided here

- **How a PSBT gets in and out.** The plan in
  [ADR 0003](0003-agent-operating-limits.md) names the camera, and no `no_std`
  Rust driver can read it. The choices: a microSD card (esp-hal has a partial
  SD/MMC driver, the [board reference](../../.github/skills/device-references/references/board-waveshare-esp32-p4-wifi6-touch-lcd-3.5.md)
  records the vendor's wiring, and a card needs a file-system reader, which is
  more hostile input); QR codes on the screen, for output only; a camera driver
  written for this project, which is large; or waiting for esp-hal. USB or UART
  would end the air gap. Recommended: microSD first, because it is the only
  two-way path that has a driver today. The scope above does not depend on
  this choice.
- **RDTS limits.** Still deferred to
  [#21](https://github.com/cuddy-five/esp32p4/issues/21).
- **The seed.** How the user enters or creates it, the entropy source, where
  secrets sit in memory and how they are wiped. The first signing tasks use
  public test seeds only.
- **Rust crates** for secp256k1, BIP32 and BIP39. None is chosen.
- **Screen wording** and how the user approves.

## If the owner accepts

1. The status line changes to "accepted" with the date, together with any row
   the owner changed.
2. First task (firmware, so task records are required): a PSBT version 0
   reader in `wallet-core` with every rule above that needs no key: format,
   version, size and money limits, hash type and address kinds. It returns a
   summary (outputs and fee) or one refusal.
3. The owner chooses the Rust crates for secp256k1, BIP32 and BIP39. Rows 2, 5
   and 7 cannot be built without them.
4. Second task: key derivation, the ownership and change checks (rows 2, 5 and
   7) and signing, against the public BIP32, BIP39 and BIP84 vectors, with the
   cross-family review ADR 0003 requires.
5. Proof that it works with Knots: the pinned release on regtest, with the
   fork scheduled (`-testactivationheight=blake2b@<height>`), creates the PSBT,
   finalizes the result and accepts the transaction. Until a verifier runs
   that, "works with Knots" is unproven.
6. The interface task also needs two things that never expose a private key:
   showing the account public key, so Knots can watch the wallet, and showing a
   receive address, so the user can check it on the device.
