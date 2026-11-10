# Project Brief: Human-directed engineering control plane

## Current work

Build a usable agent team and its control-plane pipeline. The owner directs development and retains commit and merge decisions. Repository protections are required per owner instruction and declared active in settings files; verify their live state separately. Automated background agent loops remain governed by explicit owner authorization.

## Existing implementation

Node.js 20+ ESM CLI, closed JSON contracts, policy consistency checks, GitHub settings reconciliation, evidence construction and review-domain mapping. Log compaction is local and deterministic. These utilities do not prove runtime dispatch, approval authentication or completed independent review.

## Team and next work

Seven working agents: coordinator, planner, control-plane implementer, Rust/Bitcoin/ESP32 engineer, reviewer, security auditor and verifier. The Foundry prepares their packages. Project skills cover planning, implementation, review, verification, codebase knowledge, context engineering, Rust patterns and Rust testing. File presence and profile declarations do not prove client loading.

[Issue #5](https://github.com/cuddy-five/esp32p4/issues/5) is closed. [Issue #6](https://github.com/cuddy-five/esp32p4/issues/6) is finished: every agent's skills, tools and model were tried live, and the [tool table and setup guide](docs/runbooks/agent-tools.md) record the results. [Issue #7](https://github.com/cuddy-five/esp32p4/issues/7) is closed: committed task records, the `gate check` and `task status` commands, and the `task-gate` check on pull requests. [Issue #8](https://github.com/cuddy-five/esp32p4/issues/8) is closed: an authenticated `/halt` and `/resume`, recovery reporting, and recorded failure exercises, including one Rust no_std exercise whose code was not kept. There is still no automatic dispatcher; the owner or the coordinator starts each role.

On 2026-11-10 the owner asked for the Rust gate, and only the gate. `firmware/` holds an empty `no_std` Cargo workspace (`wallet-core`, no wallet logic) with a pinned toolchain. CI's `firmware` job runs `scripts/gates/firmware-check.sh`: formatting, lints, host tests and a `no_std` build for `riscv32imafc-unknown-none-elf`, the target esp-hal lists for the ESP32-P4 (not yet a reviewed fact in `device-references`). The firmware review checklist in `.review-domains.json` is on, so a task that changes `firmware/**` needs the security auditor's review. The owner also decided that agents write the wallet code and the owner oversees. Writing wallet code is still a separate decision.

## Later firmware work

The intended wallet uses Rust no_std, stateless operation, air-gapped use, Blake2b and UNIFIED_SIGHASH on an ESP32-P4 board. On 2026-11-03 the owner decided that it signs only with the unified sighash and that the board's ESP32-C6 radio, or its antenna feed, is removed; the open firmware decisions are in [issue #21](https://github.com/cuddy-five/esp32p4/issues/21). Verify the exact board, camera, protocol, test vectors and the radio removal before implementation. Production firmware is not the current task.

## References

- [Manual team runbook](docs/runbooks/agent-team.md)
- [Agent operating limits](docs/decisions/0003-agent-operating-limits.md)
- [Team roadmap](docs/architecture/section-one-roadmap-draft.md)
- [Skills and tools](docs/plans/agent-team-skills-and-tools-draft.md)
