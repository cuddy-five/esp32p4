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

- Main runtime entry: [src/cli.js](../../src/cli.js) — Executable CLI script providing commands: `validate`, `schema`, `policy`, `evidence`, `compact`, and `settings`. Configured in [package.json](../../package.json) under `"bin": { "control-plane": "./src/cli.js" }`.
- Secondary entry points:
  - [.github/actions/validate-contract/action.yml](../../.github/actions/validate-contract/action.yml) — Composite GitHub Action used across consumer repositories to validate contract files.
  - [.github/workflows/ci.yml](../../.github/workflows/ci.yml) — Continuous integration workflow running tests, policy checks, whitespace linting, and contract validation.
  - [.github/workflows/merge-gate.yml](../../.github/workflows/merge-gate.yml) — PR merge-gate: informational report plus the `task-gate` check over committed task records.
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

- File naming pattern: Kebab-case is common in source and schema files; documentation also uses uppercase names such as PROJECT.md (e.g. `state-machine.yaml`, `common.schema.json`, `contracts-strictness.test.js`).
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

Use the [role guide](../runbooks/using-agents.md) for responsibilities and each
profile's frontmatter for current handoff targets. The owner directs handoffs;
a target declaration does not start a worker.

### 7) Instruction and Prompt Mapping

Agent guidance is described in three places; actual loading depends on the client:
1. **Charter (`.github/agents/*.agent.md`)**: Declares identity, tools, skills, model allocation, and valid handoff targets.
2. **Instructions (`.github/instructions/*.instructions.md`)**: Domain guidance whose actual delivery must be checked in the client (e.g. [rust-coder.instructions.md](../../.github/instructions/rust-coder.instructions.md) applies strictly to `firmware/**/*.rs`).
3. **Prompts (`.github/prompts/*.prompt.md`)**: Concrete phase execution templates (e.g. [plan.prompt.md](../../.github/prompts/plan.prompt.md), [implement.prompt.md](../../.github/prompts/implement.prompt.md), [review.prompt.md](../../.github/prompts/review.prompt.md), [recover.prompt.md](../../.github/prompts/recover.prompt.md)).

### 8) Project Skills Directory (`.github/skills/`)

Each skill is a folder with a `SKILL.md` (frontmatter `name`, `description`,
optional `license`) and any supporting `references/` or text files. A profile's
`skills:` list preloads one to three of them. Its **Skills** line names the
optional ones, which the agent loads on demand. Adapted third-party skills also
carry `NOTICE.md` (source, commit, changes) and the upstream license text.
`tests/unit/agent-team-config.test.js` checks the frontmatter, the notices and
the profile wiring.

The per-agent table, every skill's source and license, and the live checks are
in the [agent tools runbook](../runbooks/agent-tools.md#skills). That runbook is
the one place to update when a skill is added or reassigned. `device-references`
holds the shared, sourced facts about the chip, board, Bitcoin standards and
the intended fork.

### 9) Registries and Mapping Configurations

- [`.agents.registry.json`](../../.agents.registry.json): Formal role declarations for models, budgets and scopes; not the full client roster. Registry lint checks this file; agent-team-config checks client profiles.
- [`.skills.registry.json`](../../.skills.registry.json): ECC skill catalogue with declared models and costs, limited to the reviewers and helpers this repository uses. It does not enumerate the project skills above or prove that a skill is installed.
- [`.workflows.registry.json`](../../.workflows.registry.json): Declared workflow catalogue. Each workflow lists the `state-machine.yaml` states it covers; that file is the only task lifecycle. The catalogue does not start workers.
- [`.review-domains.json`](../../.review-domains.json): Maps modified file paths to domain-specific review checklists (e.g. Control Plane JS vs. Rust `#![no_std]` firmware).
