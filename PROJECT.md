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
- ✅ Jev intake classification: `buildIntakeRequest()` for request intent routing.
- ✅ 204/204 unit and security tests passing.
- ✅ All contract examples validating.

### Not Yet Started

- ⏳ Jev API integration (HTTP POST to TypeSafe, response handling, error cases).
- ⏳ Coordinator automation (task intake, initial classification, routing to planner).
- ⏳ Agent handoff orchestration (task → plan → review → implement → verify → merge).
- ⏳ Hardware wallet crypto modules (Blake2b, ECDSA, BIP39).
- ⏳ ESP32 firmware (bootloader, key storage, transaction signing).
- ⏳ Bitcoin protocol implementation (UTXO, segwit, coin selection, fees).
- ⏳ Host communication (USB or BLE stack).
- ⏳ Production CI/CD workflows (GitHub Actions, artifact signing, release automation).

## Known Unknowns / Open Questions

1. **Jev Model Routing**: Which model alias should be pinned? (`jev-latest` vs. explicit version). Calibration data needed for intent thresholds.
2. **Agent Deployment**: Will agents run locally (this machine), in GitHub Actions (CI), or via remote API? Affects secret management and tool integration.
3. **Bitcoin Compliance**: Which standards (BIP32, BIP39, BIP44, BIP49, BIP84) must the wallet support? Does hardware support hardware-accelerated ECDSA?
4. **ESP32 Toolchain**: ESP-IDF version? Rust (`esp-rs`) or C? FreeRTOS configuration?
5. **Adversarial Coverage**: What ratio of agents to roles in each run? How are agents selected (cost-optimized model families)?

## Next Immediate Steps

1. **Complete Jev integration**: Implement `callJev()` to POST requests and handle responses; add error handling and retry logic.
2. **Create PROJECT.md sections** for Hardware & Bitcoin architecture (once open questions answered).
3. **Bootstrap first task**: Write a task contract for "Implement Jev API integration" and follow it through the full loop.
4. **Set up Basic Memory**: Use ECC + Basic Memory for cross-session evidence and learned routing patterns.
5. **Define coordinator automation**: Write state transitions for task → plan → implement → merge in code; currently manual.

## References

- **Control Plane Design**: [docs/architecture/adversarial-loop.md](docs/architecture/adversarial-loop.md), [docs/architecture/contracts.md](docs/architecture/contracts.md)
- **Jev Integration**: [docs/architecture/jev.md](docs/architecture/jev.md) (local reference), [TypeSafe Docs](https://docs.typesafe.ai)
- **Team Runbook**: [docs/runbooks/agent-team.md](docs/runbooks/agent-team.md)
- **Original Skeleton**: [docs/architecture/skeleton-prompt.md](docs/architecture/skeleton-prompt.md)
- **Agent Rules**: [AGENTS.md](AGENTS.md)
