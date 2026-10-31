# Codebase Structure

## Core Sections (Required)

### 1) Top-Level Map

| Path | Purpose | Evidence |
|------|---------|----------|
| `.github/` | Control-plane governance: contracts, policies, state machine, settings, workflows, composite actions, agent profiles, instructions, prompt templates, and project skills | [.github/control-plane/](../../.github/control-plane), [.github/agents/](../../.github/agents), [.github/workflows/](../../.github/workflows) |
| `src/` | Production control-plane JavaScript library and CLI implementation (plain ESM, Node >=20) | [src/cli.js](../../src/cli.js), [src/lib/](../../src/lib) |
| `tests/` | Comprehensive test suites using native `node:test` (`unit/`, `security/`, `helpers/`) | [tests/unit/](../../tests/unit), [tests/security/](../../tests/security) |
| `docs/` | Architecture documents, ADRs, runbooks, plans, threat models, agent documentation, and codebase knowledge | [docs/architecture/](../../docs/architecture), [docs/decisions/](../../docs/decisions), [docs/codebase/](../../docs/codebase) |
| `scripts/` | Scaffolding for runtime bootstrap, adapters, and gates | [scripts/](../../scripts) |
| `.devcontainer/` | Development container configurations (`Dockerfile.disabled`, `devcontainer.json.disabled`) | [.devcontainer/](../../.devcontainer) |
| `AGENTS.md` | Primary contract and working agreement for all agents operating in this repository | [AGENTS.md](../../AGENTS.md) |
| `PROJECT.md` | Authoritative project brief detailing current scope, active enforcements, and team structure | [PROJECT.md](../../PROJECT.md) |
| `GLOSSARY.md` | Canonical control-plane domain terminology | [GLOSSARY.md](../../GLOSSARY.md) |

### 2) Entry Points

- Main runtime entry: [src/cli.js](../../src/cli.js#L1-L120) — Executable CLI script providing commands: `validate`, `schema`, `policy`, `evidence`, `compact`, and `settings`. Configured in [package.json](../../package.json#L11) under `"bin": { "control-plane": "./src/cli.js" }`.
- Secondary entry points:
  - [.github/actions/validate-contract/action.yml](../../.github/actions/validate-contract/action.yml) — Composite GitHub Action used across consumer repositories to validate contract files.
  - [.github/workflows/ci.yml](../../.github/workflows/ci.yml) — Continuous integration workflow running tests, policy checks, whitespace linting, and contract validation.
  - [.github/workflows/merge-gate.yml](../../.github/workflows/merge-gate.yml) — Informational PR merge-gate report runner.
  - [.github/workflows/settings-sync.yml](../../.github/workflows/settings-sync.yml) — Reconciles repository settings when triggered via workflow dispatch.
- How entry is selected: Invoked via standard CLI commands (`node src/cli.js <command>`), npm scripts (`npm test`, `npm run validate:examples`), or GitHub Actions triggers (`pull_request`, `push`, `workflow_dispatch`).

### 3) Module Boundaries

| Boundary | What belongs here | What must not be here |
|----------|-------------------|------------------------|
| `src/cli.js` | Argument parsing (`parseArgs`), command routing, formatting output for stdout/stderr, setting exit codes | Direct HTTP network calls, business schema logic, or raw file schema compilation |
| `src/lib/contracts.js` | `ContractRegistry` class, schema loading, compiling schemas with `Ajv2020`, `$ref` resolution, validating documents | Network requests, CLI flags, business policy checks |
| `src/lib/orchestration.js` | Reading and validating `state-machine.yaml` and `approvals.yaml`, ensuring enum agreement with schemas, glob path matching (`globMatch`) | Schema compilation, direct execution of transitions, GitHub mutations |
| `src/lib/settings/` | Pure resource planners (`plan(desired, actual)`) for labels and rulesets, computing diffs and required changes | Side-effects in `plan()`; I/O is restricted to `fetchActual()` and `apply()` |
| `src/lib/github.js` | Minimal REST client over native `fetch`, retry/exponential backoff, GitHub error translation (`GitHubApiError`) | CLI argument parsing, contract schema validation logic |
| `src/evidence.js` | Scope validation (`isPathInScope`), diff out-of-scope calculation, token budget evaluation, evidence contract building | GitHub REST calls, state transition mutations |
| `src/compaction.js` | Semantic log chunking and local deterministic scoring for error diagnostic extraction | Network requests, third-party LLM calls, mutating files |
| `src/review-domains.js` | Determining required review domain checklists from modified file paths | Direct reviewer invocation, approval decisions |
| `.github/control-plane/contracts/` | Pure JSON Schema 2020-12 documents and sample contract instances | Executable code, relaxed open schemas (`unevaluatedProperties: true` is forbidden) |

### 4) Naming and Organization Rules

- File naming pattern: Strict kebab-case across all source, schema, and documentation files (e.g. `state-machine.yaml`, `common.schema.json`, `contracts-strictness.test.js`).
- Directory organization pattern: Layer-based within `src/` (`src/` entry points, `src/lib/` domain logic and transport, `src/lib/settings/` resource reconciliation) and contract-based in `.github/control-plane/` (`contracts/`, `orchestration/`, `policies/`, `settings/`).
- Import aliasing or path conventions: Standard ECMAScript Modules with relative paths and explicit `.js` extensions (e.g. `import { ContractRegistry } from "./lib/contracts.js"`). No path aliases (`@/`) or package self-references in source imports.

### 5) Evidence

- [package.json](../../package.json)
- [src/cli.js](../../src/cli.js)
- [src/lib/paths.js](../../src/lib/paths.js)
- [src/lib/contracts.js](../../src/lib/contracts.js)
- [src/lib/orchestration.js](../../src/lib/orchestration.js)
- [src/lib/settings/index.js](../../src/lib/settings/index.js)
- [.github/control-plane/contracts/](../../.github/control-plane/contracts/)

## Extended Sections (Optional)

### 6) Agent Fleet Deep Map (`.github/agents/`)

The repository configures eight specialized agent charters under [`.github/agents/`](../../.github/agents):

| Profile File | Agent Role | Primary Focus | Designated Handoff Target |
|--------------|------------|---------------|---------------------------|
| [coordinator.agent.md](../../.github/agents/coordinator.agent.md) | `coordinator` | Neutral task routing, gate validation, budget holding | `planner`, `implementer`, `verifier` |
| [planner.agent.md](../../.github/agents/planner.agent.md) | `planner` | Codebase discovery (`acquire-codebase-knowledge`), step planning | `reviewer`, `coordinator` |
| [implementer.agent.md](../../.github/agents/implementer.agent.md) | `implementer` | Constructive code execution strictly within `task.scope` | `reviewer` |
| [rust-coder.agent.md](../../.github/agents/rust-coder.agent.md) | `rust-coder` | Embedded Rust `#![no_std]` firmware, ESP32-P4 drivers, Blake2b | `reviewer`, `security-auditor` |
| [reviewer.agent.md](../../.github/agents/reviewer.agent.md) | `reviewer` | Adversarial code and plan inspection, regression detection | `implementer` (request changes), `verifier` |
| [security-auditor.agent.md](../../.github/agents/security-auditor.agent.md) | `security-auditor` | Hostile inspection of secret handling, crypto hygiene, untrusted input | `implementer` (findings), `verifier` |
| [verifier.agent.md](../../.github/agents/verifier.agent.md) | `verifier` | Skeptical independent test re-runs, merge readiness verification | `coordinator` (terminal result) |
| [custom-agent-foundry.agent.md](../../.github/agents/custom-agent-foundry.agent.md) | `custom-agent-foundry` | Generates, audits, and tunes agent packages and charters | `coordinator` |

### 7) Instruction and Prompt Mapping

Agent behavior is governed through a three-layer hierarchy:
1. **Charter (`.github/agents/*.agent.md`)**: Declares identity, tools, skills, model allocation, and valid handoff targets.
2. **Instructions (`.github/instructions/*.instructions.md`)**: Persistent static rules applied to all operations in a domain (e.g. [rust-coder.instructions.md](../../.github/instructions/rust-coder.instructions.md) applies strictly to `firmware/**/*.rs`).
3. **Prompts (`.github/prompts/*.prompt.md`)**: Concrete phase execution templates (e.g. [plan.prompt.md](../../.github/prompts/plan.prompt.md), [implement.prompt.md](../../.github/prompts/implement.prompt.md), [review.prompt.md](../../.github/prompts/review.prompt.md), [recover.prompt.md](../../.github/prompts/recover.prompt.md)).

### 8) Project Skills Directory (`.github/skills/`)

| Skill Directory | Purpose | Primary Consumer |
|-----------------|---------|------------------|
| [acquire-codebase-knowledge/](../../.github/skills/acquire-codebase-knowledge) | Generates and updates the seven foundational knowledge documents in `docs/codebase/` using static AST and directory scans | `planner` |
| [planning/](../../.github/skills/planning) | Decomposes task intent into step-by-step implementation plans with acceptance checks and rollback | `planner` |
| [implementation/](../../.github/skills/implementation) | Guides scoped code edits, test writing, and generation of handoff contracts | `implementer`, `rust-coder` |
| [review/](../../.github/skills/review) | Enforces adversarial inspection across code quality, regressions, and design | `reviewer` |
| [verification/](../../.github/skills/verification) | Independent execution of test suites and re-derivation of evidence contracts | `verifier` |
| [context-engineering/](../../.github/skills/context-engineering) | Optimizes token budgets, prompt compaction, and memory retrieval | All agents |

### 9) Registries and Mapping Configurations

- [`.agents.registry.json`](../../.agents.registry.json): Formal machine-readable registry of all agents, allocating models, budgets, and scopes. Verified by [`tests/unit/agent-team-config.test.js`](../../tests/unit/agent-team-config.test.js).
- [`.skills.registry.json`](../../.skills.registry.json): Declares available project skills, category tags, and estimated token/credit costs.
- [`.workflows.registry.json`](../../.workflows.registry.json): Maps control plane workflows to risk levels and task state transitions.
- [`.review-domains.json`](../../.review-domains.json): Maps modified file paths to domain-specific review checklists (e.g. Control Plane JS vs. Rust `#![no_std]` firmware).
