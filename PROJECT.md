# Project Brief: Human-directed engineering control plane

## Current work

Build a usable agent team and its control-plane pipeline. The owner directs development and retains commit and merge decisions. Repository protections are required per owner instruction and declared active in settings files; verify their live state separately. Automated background agent loops remain governed by explicit owner authorization.

## Existing implementation

Node.js 20+ ESM CLI, closed JSON contracts, policy consistency checks, GitHub settings reconciliation, evidence construction and review-domain mapping. Log compaction is local and deterministic. These utilities do not prove runtime dispatch, approval authentication or completed independent review.

On 2026-11-13 four checking tools were added, none of which starts an agent. `evidence --base --run` reads a commit's changed files from git and runs its checks on files that equal that commit, so a verifier no longer types those facts. `overview` lists what waits on the owner, including branches with unmerged work and no pull request. The `overseer-commands` workflow re-runs `task-gate` when the owner posts `/approve`, `/halt` or `/resume`; it has not yet run on GitHub. A review domain can be marked `task_required`, so that a pull request in that area fails `task-gate` without task records; the `firmware` domain declares it as `false`, and turning it on is the owner's decision.

## Team and next work

Seven working agents: coordinator, planner, control-plane implementer, Rust/Bitcoin/ESP32 engineer, reviewer, security auditor and verifier. The Foundry prepares their packages. Project skills cover planning, implementation, review, verification, codebase knowledge, context engineering, Rust patterns and Rust testing. File presence and profile declarations do not prove client loading.

[Issue #5](https://github.com/cuddy-five/esp32p4/issues/5) is closed. [Issue #6](https://github.com/cuddy-five/esp32p4/issues/6) is finished: every agent's skills, tools and model were tried live, and the [tool table and setup guide](docs/runbooks/agent-tools.md) record the results. [Issue #7](https://github.com/cuddy-five/esp32p4/issues/7) is closed: committed task records, the `gate check` and `task status` commands, and the `task-gate` check on pull requests. [Issue #8](https://github.com/cuddy-five/esp32p4/issues/8) is closed: an authenticated `/halt` and `/resume`, recovery reporting, and recorded failure exercises, including one Rust no_std exercise whose code was not kept. There is still no automatic dispatcher; the owner or the coordinator starts each role.

On 2026-11-10 the owner asked for the Rust gate. `firmware/` holds a `no_std` Cargo workspace with a pinned toolchain. CI's required `firmware` check runs `scripts/gates/firmware-check.sh`: formatting, lints, host tests and a `no_std` build for `riscv32imafc-unknown-none-elf`, the target esp-hal lists for the ESP32-P4 (not yet a reviewed fact in `device-references`). The firmware review checklist in `.review-domains.json` is on, so a task that changes `firmware/**` needs the security auditor's review. The owner also decided that agents write the wallet code and the owner oversees.

The first wallet code is in `firmware/wallet-core`: a transaction reader and the fork's unified signature hash. It reproduces all 166 test vectors of the pinned Bitcoin Knots release. It holds no key and signs nothing, has run only on a development computer, and has not yet had an independent review or security audit. Its one dependency is `bitcoin_hashes` (SHA-256). Each further piece of wallet code is the owner's decision.

## Later firmware work

The intended wallet uses Rust no_std, stateless operation, air-gapped use, Blake2b and UNIFIED_SIGHASH on an ESP32-P4 board. On 2026-11-03 the owner decided that it signs only with the unified sighash and that the board's ESP32-C6 radio, or its antenna feed, is removed; the open firmware decisions are in [issue #21](https://github.com/cuddy-five/esp32p4/issues/21). Verify the exact board, camera, protocol, test vectors and the radio removal before implementation. Production firmware is not the current task.

## References

- [Manual team runbook](docs/runbooks/agent-team.md)
- [Agent operating limits](docs/decisions/0003-agent-operating-limits.md)
- [Team roadmap](docs/architecture/section-one-roadmap-draft.md)
- [Skills and tools](docs/plans/agent-team-skills-and-tools-draft.md)
