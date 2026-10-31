# Technology Stack

## Core Sections (Required)

### 1) Runtime Summary

| Area | Value | Evidence |
|------|-------|----------|
| Primary language | JavaScript (ECMAScript Modules, ES2022+) | [package.json](../../package.json#L4), [docs/decisions/0001-node-runtime-and-closed-contracts.md](../../docs/decisions/0001-node-runtime-and-closed-contracts.md#L16-L24) |
| Control-plane runtime | Node.js >=20.0.0 (CI runs on Node 22) | [package.json](../../package.json#L7-L9), [.github/workflows/ci.yml](../../.github/workflows/ci.yml#L28) |
| Package manager | npm (lockfileVersion 3) | [package-lock.json](../../package-lock.json#L4) |
| Module/build system | Plain ESM (`type: module`), zero compile step | [package.json](../../package.json#L4), [docs/decisions/0001-node-runtime-and-closed-contracts.md](../../docs/decisions/0001-node-runtime-and-closed-contracts.md#L16-L24) |
| Secondary script runtime | Python 3.8+ (scanner & evaluation scripts) | [.github/skills/acquire-codebase-knowledge/scripts/scan.py](../../.github/skills/acquire-codebase-knowledge/scripts/scan.py), [tests/security/codebase-scan.test.js](../../tests/security/codebase-scan.test.js#L14) |
| Downstream firmware target | Rust `#![no_std]` (`riscv32imafc-unknown-none-elf`) | [docs/plans/esp32_p4_control_plane_hardware_wallet_specification.md](../../docs/plans/esp32_p4_control_plane_hardware_wallet_specification.md#L5), [.github/instructions/rust-coder.instructions.md](../../.github/instructions/rust-coder.instructions.md#L14) |

### 2) Production Frameworks and Dependencies

List only high-impact production dependencies (frameworks, data, transport, auth).

| Dependency | Version | Role in system | Evidence |
|------------|---------|----------------|----------|
| `ajv` | `^8.17.1` | JSON Schema 2020-12 closed contract validation (`ContractRegistry`) | [package.json](../../package.json#L22), [src/lib/contracts.js](../../src/lib/contracts.js#L3) |
| `ajv-formats` | `^3.0.1` | Format validators for Ajv (date-time, uri, email format verification) | [package.json](../../package.json#L23), [src/lib/contracts.js](../../src/lib/contracts.js#L4) |
| `yaml` | `^2.9.1` | YAML 1.2 parser for state-machine, approval policies, and agent frontmatter | [package.json](../../package.json#L24), [src/lib/orchestration.js](../../src/lib/orchestration.js#L3) |

> [!NOTE]
> Per ADR 0001, production runtime dependencies are strictly constrained to `ajv`, `ajv-formats`, and `yaml`. Transport (HTTP REST) is implemented using Node's native `fetch` API without Octokit or external HTTP libraries.

### 3) Development Toolchain

| Tool | Purpose | Evidence |
|------|---------|----------|
| `node:test` | Native unit and security test runner | [package.json](../../package.json#L13-L16) |
| `node:assert/strict` | Strict equality assertions across all 52 test suites | [tests/unit/contracts.test.js](../../tests/unit/contracts.test.js#L1), [tests/unit/cli.test.js](../../tests/unit/cli.test.js#L1) |
| `actionlint` | GitHub Actions workflow linter (with shellcheck integration) | [.github/workflows/ci.yml](../../.github/workflows/ci.yml#L80-L84), [.github/actionlint.yaml](../../.github/actionlint.yaml) |
| `git diff --check` | Whitespace and merge artifact checker run in CI | [.github/workflows/ci.yml](../../.github/workflows/ci.yml#L56-L57) |
| `actions/dependency-review-action` | PR dependency security review gate | [.github/workflows/ci.yml](../../.github/workflows/ci.yml#L97-L100) |

### 4) Key Commands

```bash
# Install dependencies
npm ci

# Run all unit and security test suites
npm test

# Run unit tests only
npm run test:unit

# Run security invariant tests only
npm run test:security

# Validate example contract documents against JSON schemas
npm run validate:examples

# Check orchestration state machine and approval policy consistency
node src/cli.js policy check

# Plan GitHub repository settings (labels, rulesets)
npm run settings:plan

# Check for settings drift (exits 2 on drift)
npm run settings:check

# Apply GitHub repository settings reconciliation (requires explicit --yes)
npm run settings:apply -- --yes

# Run codebase knowledge scanner
python3 .github/skills/acquire-codebase-knowledge/scripts/scan.py --output docs/codebase/.codebase-scan.txt
```

### 5) Environment and Config

- Config sources:
  - `.github/control-plane/orchestration/state-machine.yaml` (lifecycle states, transitions, gates, invariants)
  - `.github/control-plane/policies/approvals.yaml` (risk-based human approval requirements)
  - `.github/control-plane/settings/labels.json` (declarative GitHub labels)
  - `.github/control-plane/settings/rulesets.json` (declarative branch protection rulesets)
  - `.review-domains.json` (file pattern mapping to review domain checklists)
  - `.agents.registry.json`, `.skills.registry.json`, `.workflows.registry.json` (agent system registries)
- Required env vars:
  - `GH_TOKEN` or `GITHUB_TOKEN`: GitHub personal access token or Actions installation token with `repo` scope for settings reconciliation.
  - `GH_REPO` or `GITHUB_REPOSITORY`: Target repository in `owner/repo` format (defaults to git remote `origin` if omitted).
  - `GITHUB_API_URL`: Optional API base URL override for GitHub Enterprise Server (defaults to `https://api.github.com`).
  - `GITHUB_STEP_SUMMARY`: Optional path to GitHub Actions step summary markdown file.
- Deployment/runtime constraints:
  - Node.js runtime >= 20.0.0 required.
  - Host execution on Fedora Atomic: user-scoped tooling preferred; root filesystem is immutable.
  - Mutating operations require explicit `--yes` flag to prevent unintended writes.

### 6) Evidence

- [package.json](../../package.json)
- [package-lock.json](../../package-lock.json)
- [docs/decisions/0001-node-runtime-and-closed-contracts.md](../../docs/decisions/0001-node-runtime-and-closed-contracts.md)
- [docs/decisions/0002-human-directed-template.md](../../docs/decisions/0002-human-directed-template.md)
- [docs/decisions/0003-agent-operating-limits.md](../../docs/decisions/0003-agent-operating-limits.md)
- [.github/workflows/ci.yml](../../.github/workflows/ci.yml)
- [src/cli.js](../../src/cli.js)

## Extended Sections (Optional)

### 7) Multi-Tier Execution Matrix

The repository spans three distinct operational tiers across its lifecycle:

| Tier | Runtime & Tools | Primary Focus | Active Today? | Evidence |
|------|-----------------|---------------|---------------|----------|
| **1. Control Plane Engine** | Node.js 20+ ESM, `ajv`, `ajv-formats`, `yaml`, `node:test` | CLI, contract validation, policy enforcement, settings reconciliation | Yes | [src/cli.js](../../src/cli.js), [package.json](../../package.json) |
| **2. Autonomous Agent Fleet** | LLM assistant engines (Copilot, GPT-5.6-Luna, Claude 3.7 Sonnet), Python 3.8+ (scanner/evals), MCP tools (`basic-memory`, `atuin`) | Planning, implementation, adversarial review, verification, contract generation | Yes (Manual/Owner-directed) | [.agents.registry.json](../../.agents.registry.json), [.github/agents/](../../.github/agents) |
| **3. Hardware Wallet Firmware** | Embedded Rust `#![no_std]` (`riscv32imafc-unknown-none-elf`), `esp-hal`, `heapless`, `rust-bitcoin`, `blake2`, `zeroize` | Air-gapped, stateless Bitcoin Blake2b hardware wallet on ESP32-P4 Touch | Future Work | [docs/plans/esp32_p4_control_plane_hardware_wallet_specification.md](../../docs/plans/esp32_p4_control_plane_hardware_wallet_specification.md), [.github/instructions/rust-coder.instructions.md](../../.github/instructions/rust-coder.instructions.md) |

### 8) Agent Model Allocation Taxonomy

Allocated models and reasoning parameters specified in [`.agents.registry.json`](../../.agents.registry.json):

| Role ID | Configured Model | Reasoning Effort | Purpose & Constraints | Evidence |
|---------|------------------|------------------|-----------------------|----------|
| `planner` | `gpt-5.6-luna` | `high` | Pre-planning codebase discovery, step decomposition, acceptance criteria definition | [.agents.registry.json](../../.agents.registry.json#L8-L9), [.github/agents/planner.agent.md](../../.github/agents/planner.agent.md#L5) |
| `implementer` | `gpt-5.6-luna` | `medium` | Executes approved plans inside `task.scope.allowed_paths`; emits handoffs | [.agents.registry.json](../../.agents.registry.json#L37-L38), [.github/agents/implementer.agent.md](../../.github/agents/implementer.agent.md) |
| `reviewer` | `claude-3-7-sonnet` | `high` | Adversarially reviews plans and code changes; distinct model family from implementer | [.agents.registry.json](../../.agents.registry.json#L67-L68), [.github/agents/reviewer.agent.md](../../.github/agents/reviewer.agent.md) |
| `security_auditor` | `claude-3-7-sonnet` | `high` | Hostile security review targeting input boundaries, secret protection, crypto hygiene | [.agents.registry.json](../../.agents.registry.json#L99-L100), [.github/agents/security-auditor.agent.md](../../.github/agents/security-auditor.agent.md) |
| `verifier` | `gpt-5.6-luna` | `high` | Skeptical verification, independently re-running tests and deriving evidence | [.agents.registry.json](../../.agents.registry.json#L131-L132), [.github/agents/verifier.agent.md](../../.github/agents/verifier.agent.md) |
| `rust-coder` | `gpt-5.6-luna` | `high` | Specialist for embedded Rust `#![no_std]` firmware, ESP32-P4 peripherals, and Bitcoin cryptography | [.github/agents/rust-coder.agent.md](../../.github/agents/rust-coder.agent.md) |
| `coordinator` | `gpt-5.6-luna` | `medium` | Intake validation, task routing, state machine lifecycle management | [.github/agents/coordinator.agent.md](../../.github/agents/coordinator.agent.md) |
| `custom-agent-foundry` | `gpt-5.6-luna` | `high` | Packages and refines agent charters, prompts, skills, and tools | [.github/agents/custom-agent-foundry.agent.md](../../.github/agents/custom-agent-foundry.agent.md) |
