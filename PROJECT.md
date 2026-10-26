# Project Brief: ESP32 P4 Bitcoin Blake2b Hardware Wallet

## Overview

This project builds a hardware wallet for Bitcoin on the ESP32-P4 microcontroller, featuring on-device Blake2b hashing. The repository uses an adversarial agentic team loop orchestrated by a human overseer, with a GitHub control plane enforcing role separation, scope boundaries, and approval gates.

## Goals

1. **Complete the control-plane skeleton** with Jev routing, agent handoffs, and fully automated task orchestration.
2. **Integrate Jev (TypeSafe System One)** for intelligent request classification and workflow selection across agent roles.
3. **Build ESP32-P4 hardware wallet core** with cryptographic primitives (Blake2b), key management, and Bitcoin transaction signing.
4. **Establish production-grade CI/CD** with adversarial code review, security audit, verification, and human merge gates.

## Constraints & Owner Choices

### Control Plane Decisions

- **Language & Runtime**: Node.js 20+, ESM, no build step. Contracts are JSON Schema v2020-12 with closed shapes.
- **Agent Role Model**: Coordinator, Planner, Implementer, Reviewer (plan/code), Security Auditor, Verifier, Human Overseer.
- **Scope Enforcement**: Changes limited to `task.scope.allowed_paths`; expansion requires escalation and human approval.
- **Approval Model**: Every merge requires explicit human decision; no auto-merge. Plans and results require overseer notes.
- **Secret Handling**: `TYPESAFE_API_KEY` environment variable; no secrets in contracts, logs, or documentation.

### Hardware Wallet Decisions

- **Target MCU**: ESP32-P4 (dual-core, 2.4 GHz WiFi, hardware crypto co-processor).
- **Crypto Primitives**: Blake2b (on-device), ECDSA (hardware-accelerated), BIP39 (seed derivation).
- **Bitcoin Support**: UTXO model, segwit v0 & v1, fee estimation, coin selection, transaction signing.
- **Storage**: Secure element or eFuse protection for private keys; NVS (non-volatile storage) for watch-only data.
- **Communication**: USB or BLE for host tethering; no direct internet connectivity in MVP.
- **Firmware language**: Rust, no_std, when firmware work starts. Not started. Toolchain version is still unknown.

### Build & Test Model

- **Testing**: `node:test` for unit and security suites; adversarial test coverage >80%.
- **Security Auditing**: Static analysis (no secrets, OWASP Top 10), dynamic verification, contract shape validation.
- **Verification**: Independent re-runs of test suites against merged commits; evidence recorded for audit trail.
- **CI Gates**: Lint (actionlint, shellcheck), build validation, test pass, security review, code review approval.

## Current State

### Completed

- ✅ Control-plane skeleton with contract schemas (task, plan, review, evidence, result, escalation, handoff).
- ✅ Settings reconciliation CLI for GitHub labels and rulesets.
- ✅ Contract validation (closed shapes, size bounds, field requirements).
- ✅ State machine definition with role transitions and approval rules.
- ✅ Jev intake classification: `buildSelectionRequest()` and `interpretSelectionResponse()` for intent, workflow, agent, and skill routing.
- ✅ Jev API integration: `requestJev()` with daily spending cap ($2.00) enforcement, atomic ledger writes, fail-closed corruption handling, and `TYPESAFE_API_KEY_FILE` resolution.
- ✅ Context sieve log compaction: `src/compaction.js` and `control-plane compact` CLI command for diagnostic log preservation.
- ✅ Evidence builder and review domains: `src/evidence.js` and `src/review-domains.js` with scope verification and checklist mapping.
- ✅ 286/286 unit and security tests passing across 48 test suites.
- ✅ All contract examples validating (7/7).

### In Progress / Up Next

- 🔄 Agent definitions and role prompts (Coordinator, Planner, Implementer, Reviewer, Security Auditor, Verifier).
- ⏳ Coordinator automation and agent handoff orchestration (task → plan → review → implement → verify → merge).
- ⏳ Hardware wallet crypto modules (Blake2b, ECDSA, BIP39 in Rust `no_std`).
- ⏳ ESP32 firmware (bootloader, key storage, transaction signing).
- ⏳ Bitcoin protocol implementation (UTXO, segwit, coin selection, fees).
- ⏳ Host communication (USB or BLE stack).
- ⏳ Production CI/CD workflows (GitHub Actions, artifact signing, release automation).

## Known Unknowns / Open Questions

1. **Agent Deployment**: Which model family powers each role in the multi-agent harness? (Current defaults: Implementer=gpt-6-luna / claude, Reviewer=kimi-k3 / deepseek, Auditor=gpt-5.6-luna, Verifier=claude-haiku).
2. **Bitcoin Compliance**: Which standards (BIP32, BIP39, BIP44, BIP49, BIP84) must the wallet support for MVP?
3. **ESP32 Toolchain**: Target is `riscv32imafc-unknown-none-elf` (ESP32-P4 dual-core RISC-V). Which `esp-hal` / `esp-rs` version?
4. **Adversarial Ratio**: How many review/audit passes are required per risk tier (low, medium, high, critical)?

## Next Immediate Steps

1. **Create concrete agent definitions**: Author system prompts, role boundaries, allowed action spaces, and invocation contracts for each role.
2. **Implement coordinator automation**: Wire state machine transitions in code so tasks execute through the adversarial loop without manual handoff steps.
3. **Initialize firmware core**: Create `firmware/` crate with Rust `no_std` for ESP32-P4 and implement on-device Blake2b hashing engine.
4. **Set up Basic Memory**: Use ECC + Basic Memory for cross-session evidence and learned routing patterns.
5. **Define coordinator automation**: Write state transitions for task → plan → implement → merge in code; currently manual.

## References

- **Control Plane Design**: [docs/architecture/adversarial-loop.md](docs/architecture/adversarial-loop.md), [docs/architecture/contracts.md](docs/architecture/contracts.md)
- **Jev Integration**: [docs/architecture/jev.md](docs/architecture/jev.md) (local reference), [TypeSafe Docs](https://docs.typesafe.ai)
- **Team Runbook**: [docs/runbooks/agent-team.md](docs/runbooks/agent-team.md)
- **Original Skeleton**: [docs/architecture/skeleton-prompt.md](docs/architecture/skeleton-prompt.md)
- **Agent Rules**: [AGENTS.md](AGENTS.md)
