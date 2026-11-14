# Project Brief: ESP32-P4 Bitcoin Blake2b hardware wallet

## Purpose and owner

Agents build the wallet; the owner directs the work and decides what may be
committed, published, installed, flashed or merged. The control plane helps
agents work from checked sources, small tasks, independent reviews and repeatable
tests. Its Node.js utilities remain reusable by other projects.

The intended product is a **stateless, air-gapped wallet for the Bitcoin
BLAKE2b fork**, written in Rust `no_std`, on the **Waveshare
ESP32-P4-WIFI6-Touch-LCD-3.5**. The intended ESP32-P4 **chip revision is v3.2**;
this is not a confirmed PCB revision or a measurement of the owner's device.
This is the board the owner bought. The owner states that it carries the
installed 5 MP OV5647 camera (recorded 2026-10-26) and believes v3.2 refers to
the chip (2026-11-13). Neither has been checked on the device.

## Start a task

Read [wallet development](docs/runbooks/wallet-development.md), then load only
the sources for the task. `node scripts/wallet-context.js signing` prints the
signing source and check list without running checks or starting agents. `node`
runs the script; `signing` is its topic argument, with no flags. Use `hardware`
for board work or `--help` for all topics.

Keep the outcome, allowed paths, acceptance checks and next role in one short
agreement. The [wallet task worksheet](docs/templates/wallet-task.md) helps an
agent prepare it; it is not extra mandatory paperwork. When the base branch's
review domain requires task records, use the existing validated contracts and
[manual team runbook](docs/runbooks/agent-team.md). Check the live PR before
resuming it; a local note cannot reveal a later halt or changed commit.

## Product constraints

| Requirement | Meaning and source |
| --- | --- |
| Unified-only signing | Refuse legacy sighash requests. The [pinned fork rules](.github/skills/device-references/references/fork-rules.md) define the unified message and test vectors. BLAKE2b proof of work does **not** replace the signing hash with BLAKE2b. |
| Stateless secrets | Do not persist seeds, private keys or signing history. Secret lifetime, cleanup, placement and recovery need explicit design and tests. |
| Air gap | Firmware must not depend on the onboard C6 or its SDIO link. The owner selected C6 removal or antenna-feed removal; these are different guarantees, neither verified on the device. See the [board reference](.github/skills/device-references/references/board-waveshare-esp32-p4-wifi6-touch-lcd-3.5.md). |
| Evidence before hardware assumptions | Match the actual chip revision, board wiring and selected libraries to the [device references](.github/skills/device-references/SKILL.md). A source capability is not a device test. |
| Bounded hostile input | Transaction, PSBT and optical inputs need explicit size and work limits, checked arithmetic, rejection tests and no runtime panics. Parsing success is not permission to sign. |
| Independent checks | Keep producer, reviewer, security auditor and verifier separate. Signing, entropy and critical control-plane work need the cross-family review in [ADR 0003](docs/decisions/0003-agent-operating-limits.md); record the observed model, not just its configured name. |

## Observed repository state — 2026-11-13

Refresh this snapshot before choosing a dependent task.

- Merged baseline `903f497` contains the Node control plane and an empty
  `firmware/wallet-core` library. The pinned firmware gate checks formatting,
  lints, host tests and a RISC-V library build. There is no bootable wallet image.
- [PR #36](https://github.com/cuddy-five/esp32p4/pull/36), head
  `53c61ec8813ab6d4666b48d37338861d1330a46a`, adds transaction parsing and the
  unified signature hash. It holds no key and signs nothing. All eight GitHub
  checks passed at this head; cross-family review and owner merge remain pending.
- That PR also enables firmware `task_required`. It is **false in the merged
  baseline**. The rule is read from the PR base, so this change does not impose
  task records on PR #36 itself. Re-read `.review-domains.json` after a merge.
- `evidence --base --run`, `gate check`, `task status` and `overview` are
  available. They collect or evaluate facts; they do not start agents. There is
  no automatic dispatcher. The declared rulesets were live with no drift on
  2026-11-13 (`settings check`); check again before relying on them.

## Decisions still needed before dependent implementation

- Confirm on the device: chip and PCB revision, the installed camera, the pin
  map and the radio rework. Establish whether a `no_std` Rust stack can drive
  the camera over MIPI-CSI before planning optical input around it.
- Choose supported input/script types, sighash modes, amount/fee limits,
  transaction size limits and the treatment of no-output transactions. The
  parser and digest helper deliberately do not supply the signing policy.
- Choose PSBT/QR formats, coordinator interoperability, transaction review UI,
  change-output verification and what the user must approve on screen.
- Resolve RDTS applicability from pinned rules; choose entropy conditioning,
  secret-memory placement and cleanup evidence. Camera noise is not assumed safe.
- Select and prove the HAL/driver/boot path for the actual silicon. Secure boot,
  eFuses, flashing and physical rework require a separate owner-reviewed plan.

See [issue #21](https://github.com/cuddy-five/esp32p4/issues/21) for the existing
firmware decisions. Do not fill these gaps from model memory or historical
research. Work on independent, unblocked tasks while a decision is pending.

## Acceptance and limits

Each slice needs a reproducible result, source-backed expected behavior, negative
tests where relevant, an independent review, and a verifier's actual commands
and outcomes tied to the same snapshot. The wallet guide maps these to build
stages. A green host test or cross-build does not establish device operation,
radio isolation, secret erasure or readiness to hold funds.

Before trusting a different or smaller model with wallet work, repeat the
per-agent [live check](docs/runbooks/agent-tools.md#live-check-record) on one
bounded task. Passing documentation checks does not prove that a model performs
well. Paid runs remain owner-directed.
