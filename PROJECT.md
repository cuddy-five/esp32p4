# Project Brief: Human-directed engineering control plane

## Current work

Build a usable agent team and its control-plane pipeline. The owner directs development and retains commit and merge decisions. Full control-plane ruleset enforcements are active per owner instruction; automated background agent loops remain governed by explicit owner authorization.

## Existing implementation

Node.js 20+ ESM CLI, closed JSON contracts, policy consistency checks, GitHub settings reconciliation, evidence construction and review-domain mapping. Log compaction is local and deterministic. These utilities do not prove runtime dispatch, approval authentication or completed independent review.

## Team and next work

Seven working agents: coordinator, planner, control-plane implementer, Rust/Bitcoin/ESP32 engineer, reviewer, security auditor and verifier. The Foundry prepares their packages. Four project skills support planning, implementation, review and verification.

Finish [issue #5](https://github.com/cuddy-five/esp32p4/issues/5) by demonstrating direct agent selection and coordinator delegation in the chosen client, documenting model/tool limitations, writing the beginner guide, and independently checking the published revision. Skills and MCP setup belong to issue #6. Next build durable task records, dispatch, role handoffs and enforcement, then test stopping, resuming and bounded repair.

## Later firmware work

The intended wallet uses Rust no_std, stateless operation, air-gapped use, Blake2b and UNIFIED_SIGHASH on an ESP32-P4 board. Verify the exact board, camera, protocol, test vectors and isolation method before implementation. Production firmware is not the current task.

## References

- [Manual team runbook](docs/runbooks/agent-team.md)
- [Agent operating limits](docs/decisions/0003-agent-operating-limits.md)
- [Team roadmap](docs/architecture/section-one-roadmap-draft.md)
- [Skills and tools](docs/plans/agent-team-skills-and-tools-draft.md)
