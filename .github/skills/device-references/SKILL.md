---
name: device-references
description: 'Shared, sourced facts for the ESP32-P4 hardware wallet: the chip, the board, the Bitcoin standards and the intended fork, each marked verified or unverified with its source and date. Use before relying on a hardware, protocol or signing claim in device code, a review or an audit. Not a specification; production firmware is not current work.'
---

# Device references

One shared set of checked facts for the wallet engineer (`rust-coder`), the
reviewer and the security auditor. Read only the file you need:

| File | Covers |
| --- | --- |
| [references/chip-esp32-p4.md](references/chip-esp32-p4.md) | ESP32-P4 cores, memory, radio, crypto peripherals, secure boot, flash encryption |
| [references/board-waveshare-esp32-p4-wifi6-touch-lcd-3.5.md](references/board-waveshare-esp32-p4-wifi6-touch-lcd-3.5.md) | The candidate board and its components |
| [references/bitcoin-standards.md](references/bitcoin-standards.md) | BIPs and RFCs for keys, addresses, transactions, PSBT and hashing, with their test vectors |
| [references/fork-rules.md](references/fork-rules.md) | The BLAKE2b fork (Bitcoin Knots) and its unified sighash: reference implementation pinned, rules **not yet reviewed** for the device |

## Status words

- **Verified**: checked against a primary source (the vendor's own document or
  source code, the BIP or RFC text) at a pinned commit or a stated retrieval date.
- **Verified (as declared)**: the primary source states it, but nobody has
  measured or tested it, for example a capability flag in vendor source.
- **Verified (location)**: the cited file or symbol exists at the pinned commit;
  its content has not been reviewed yet.
- **Inferred**: a reasoned link between verified facts, not itself checked.
  Confirm it before relying on it.
- **Unverified**: anything else, including secondary articles, retailer
  listings, model summaries, and the historical specification in `docs/plans/`.
  That plan is useful input; it is not evidence.

## Rules

- Rely only on **verified** facts for code, review or audit conclusions. Treat an
  **unverified** fact as a question, and name it in your report.
- Take test vectors from the primary source listed here, never from a summary or
  a model's memory.
- A verified fact is true for its source version. Check the board revision,
  chip revision and library version you actually use before applying it.
- To add or upgrade a fact: cite the primary source with a URL, pin a commit or
  version and the retrieval date, and say how you checked it. Changing these
  files is a repository change: it needs the owner's request, like any other
  edit, and an independent review.
- Never mark a fact verified because two secondary sources agree.
