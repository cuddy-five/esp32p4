# Technology Stack

## Core Sections (Required)

### 1) Runtime Summary

| Area | Value | Evidence |
|------|-------|----------|
| Primary language | JavaScript (ECMAScript Modules, ES2022+) | [package.json](../../package.json), [docs/decisions/0001-node-runtime-and-closed-contracts.md](../../docs/decisions/0001-node-runtime-and-closed-contracts.md) |
| Control-plane runtime | Node.js >=20.0.0 (CI runs on Node 22) | [package.json](../../package.json), [.github/workflows/ci.yml](../../.github/workflows/ci.yml) |
| Package manager | npm (lockfileVersion 3) | [package-lock.json](../../package-lock.json) |
| Module/build system | Plain ESM (`type: module`), zero compile step | [package.json](../../package.json), [docs/decisions/0001-node-runtime-and-closed-contracts.md](../../docs/decisions/0001-node-runtime-and-closed-contracts.md) |
| Secondary script runtime | Python 3 (codebase discovery scanner) | [.github/skills/acquire-codebase-knowledge/scripts/scan.py](../../.github/skills/acquire-codebase-knowledge/scripts/scan.py), [tests/security/codebase-scan.test.js](../../tests/security/codebase-scan.test.js) |
| Downstream firmware target | Rust `#![no_std]`; exact target pending verification | [docs/plans/esp32_p4_control_plane_hardware_wallet_specification.md](../../docs/plans/esp32_p4_control_plane_hardware_wallet_specification.md), [.github/instructions/rust-coder.instructions.md](../../.github/instructions/rust-coder.instructions.md) |

### 2) Production Frameworks and Dependencies

List only high-impact production dependencies (frameworks, data, transport, auth).

| Dependency | Version | Role in system | Evidence |
|------------|---------|----------------|----------|
| `ajv` | `^8.17.1` | JSON Schema 2020-12 closed contract validation (`ContractRegistry`) | [package.json](../../package.json), [src/lib/contracts.js](../../src/lib/contracts.js) |
| `ajv-formats` | `^3.0.1` | Format validators for Ajv (date-time, uri, email format verification) | [package.json](../../package.json), [src/lib/contracts.js](../../src/lib/contracts.js) |
| `yaml` | `^2.9.1` | YAML 1.2 parser for state-machine, approval policies, and agent frontmatter | [package.json](../../package.json), [src/lib/orchestration.js](../../src/lib/orchestration.js) |

> [!NOTE]
> Per ADR 0001, production runtime dependencies are strictly constrained to `ajv`, `ajv-formats`, and `yaml`. Transport (HTTP REST) is implemented using Node's native `fetch` API without Octokit or external HTTP libraries.

### 3) Development Toolchain

| Tool | Purpose | Evidence |
|------|---------|----------|
| `node:test` | Native unit and security test runner | [package.json](../../package.json) |
| `node:assert/strict` | Strict assertions in the test suites | [tests/unit/contracts.test.js](../../tests/unit/contracts.test.js), [tests/unit/cli.test.js](../../tests/unit/cli.test.js) |
| `actionlint` | GitHub Actions workflow linter (with shellcheck integration) | [.github/workflows/ci.yml](../../.github/workflows/ci.yml), [.github/actionlint.yaml](../../.github/actionlint.yaml) |
| `git diff --check` | Whitespace and merge artifact checker run in CI | [.github/workflows/ci.yml](../../.github/workflows/ci.yml) |
| `actions/dependency-review-action` | PR dependency security review gate | [.github/workflows/ci.yml](../../.github/workflows/ci.yml) |

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
- Authentication and optional environment overrides:
  - `GH_TOKEN` or `GITHUB_TOKEN`: GitHub personal access token or Actions installation token with `repo` scope for settings reconciliation.
  - `GH_REPO` or `GITHUB_REPOSITORY`: Optional target repository in `owner/repo` format (defaults to git remote `origin` if omitted).
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
| **1. Control Plane Engine** | Node.js 20+ ESM, `ajv`, `ajv-formats`, `yaml`, `node:test` | CLI, contract validation, policy declaration checks, settings reconciliation | Yes | [src/cli.js](../../src/cli.js), [package.json](../../package.json) |
| **2. Owner-directed Agent Team** | Copilot profiles, Python scanner, configured GitHub/Context7/Basic Memory tools | Planning, implementation, adversarial review, verification, contract generation | Yes (Manual/Owner-directed) | [.agents.registry.json](../../.agents.registry.json), [.github/agents/](../../.github/agents) |
| **3. Hardware Wallet Firmware** | Embedded Rust `#![no_std]`; target and library choices require verification | Air-gapped, stateless Bitcoin Blake2b hardware wallet on ESP32-P4 Touch | Future Work | [docs/plans/esp32_p4_control_plane_hardware_wallet_specification.md](../../docs/plans/esp32_p4_control_plane_hardware_wallet_specification.md), [.github/instructions/rust-coder.instructions.md](../../.github/instructions/rust-coder.instructions.md) |

### 8) Agent model configuration

Read the current profiles in [`.github/agents/`](../../.github/agents/) for
client model requests. The formal [registry](../../.agents.registry.json) is a
separate declaration, not proof of live selection. Confirm the model used in the
client before relying on model-family diversity.
