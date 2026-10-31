# Testing Patterns

## Core Sections (Required)

### 1) Test Stack and Commands

- Primary test framework: Node.js native test runner (`node:test`) on Node.js >= 20.0.0
- Assertion/mocking tools: `node:assert/strict` and in-memory test doubles ([tests/helpers/fake-github.js](../../tests/helpers/fake-github.js))
- Commands:

```bash
# Run all unit and security test suites (52 suites, 321 tests)
npm test

# Run unit tests only
npm run test:unit

# Run security invariant suites only
npm run test:security

# Validate all example contract documents
npm run validate:examples

# Check orchestration state-machine and approvals policy consistency
node src/cli.js policy check

# Compact failure logs for reporting
node src/cli.js compact --file /path/to/test.log --offline --max-chars 2000
```

### 2) Test Layout

- Test file placement pattern: Root-level `tests/` directory separated into functional categories:
  - `tests/unit/`: Component-level unit tests for CLI, schema compilation, diffing, evidence generation, GitHub transport, orchestration, agent linting, and registry validation.
  - `tests/security/`: Invariant and policy tests asserting schema closure (`contracts-strictness.test.js`) and scan boundary enforcement (`codebase-scan.test.js`).
  - `tests/helpers/`: Reusable test harnesses and fake implementations (`fake-github.js`).
- Naming convention: Files follow kebab-case with `.test.js` suffix (e.g. `contracts.test.js`, `orchestration.test.js`, `codebase-scan.test.js`).
- Setup files: No global test runner setup file; each test file imports necessary dependencies and executes independently.

### 3) Test Scope Matrix

| Scope | Covered? | Typical target | Notes |
|-------|----------|----------------|-------|
| Unit | Yes | CLI parsing, schema loading, object diffing, scope evaluation, policy validation, log compaction, agent specification linting | 16 test suites in `tests/unit/` testing logic in isolation |
| Security Invariant | Yes | Schema closure, prototype pollution prevention, path boundary enforcement | `tests/security/contracts-strictness.test.js` enforces `unevaluatedProperties: false` on every contract; `codebase-scan.test.js` enforces secret exclusion |
| Integration | Partial | Settings reconciliation against `FakeGitHub` | Tests plan and apply flows against in-memory GitHub REST simulator |
| E2E | Partial | Composite action execution in CI (`.github/actions/validate-contract`) | Runs CLI in GitHub Actions runner environment against example contracts |

### 4) Mocking and Isolation Strategy

- Main mocking approach: In-memory fake objects and dependency injection.
  - The `GitHubClient` constructor accepts custom `fetch` implementations.
  - `FakeGitHub` ([tests/helpers/fake-github.js](../../tests/helpers/fake-github.js)) intercepts REST calls, maintaining state in JavaScript Maps to verify create, update, delete, and rename HTTP calls.
  - CLI tests ([tests/unit/cli.test.js](../../tests/unit/cli.test.js)) inject custom `stdout`, `stderr`, and `env` streams to test command exit codes and output formatting without spawning external processes.
- Isolation guarantees: Each test creates independent instances of `ContractRegistry` or `FakeGitHub`; tests do not persist global state or mutate external systems.
- Common failure mode in tests: Filesystem drift or missing referenced files in mock directory structures.

### 5) Coverage and Quality Signals

- Coverage tool + threshold: None currently configured (`[TODO]`). Owner confirmed that adding standard coverage reporting (`node --test --experimental-test-coverage` or `c8`) is welcomed when appropriate.
- Current test suite status:
  - 52 test suites run under `npm test`.
  - 321 tests pass, 0 fail.
- Automated CI quality gates:
  - Pull requests trigger `.github/workflows/ci.yml`, running `npm test`, `node src/cli.js policy check`, `git diff --check`, workflow linting with `actionlint`, and contract validation.

### 6) Evidence

- [package.json](../../package.json#L13-L16)
- [tests/helpers/fake-github.js](../../tests/helpers/fake-github.js)
- [tests/security/contracts-strictness.test.js](../../tests/security/contracts-strictness.test.js)
- [tests/unit/cli.test.js](../../tests/unit/cli.test.js)
- [tests/unit/orchestration.test.js](../../tests/unit/orchestration.test.js)
- [.github/workflows/ci.yml](../../.github/workflows/ci.yml)

## Extended Sections (Optional)

### 7) Agent Specification & Registry Integrity Testing

Specific test suites continuously guard agent and registry integrity:
- [`tests/unit/agent-team-config.test.js`](../../tests/unit/agent-team-config.test.js):
  - Asserts that all 8 agreed agent profiles exist and have matching filenames and frontmatter `name`.
  - Asserts that all referenced skills exist on disk in `.github/skills/`.
  - Asserts that tool aliases are valid and that silent installations (`npx -y`) are blocked.
- [`tests/unit/rust-coder-agent-lint.test.js`](../../tests/unit/rust-coder-agent-lint.test.js):
  - Checks frontmatter schema, path portability (no hardcoded host absolute paths), `#![no_std]` embedded purity prescriptions, and valid handoff targets.
- [`tests/unit/selection-registry-lint.test.js`](../../tests/unit/selection-registry-lint.test.js):
  - Validates that descriptions in `.agents.registry.json` are bounded decision rules starting with `Choose ` and unique.
- [`tests/unit/planner-pipeline.test.js`](../../tests/unit/planner-pipeline.test.js):
  - Verifies that the planner agent can resolve its `acquire-codebase-knowledge` skill and all seven bundled templates and references.

### 8) Security Invariant Testing (`tests/security/`)

- [`tests/security/contracts-strictness.test.js`](../../tests/security/contracts-strictness.test.js):
  - Dynamically traverses every contract schema to ensure `unevaluatedProperties: false` or `additionalProperties: false` is set everywhere.
  - Verifies that `overseer_note` is strictly required on all human-facing contracts (`review`, `result`, `escalation`) and that token notes are rejected.
  - Confirms prototype pollution keys (`__proto__`, `constructor`) are rejected as unknown properties.
- [`tests/security/codebase-scan.test.js`](../../tests/security/codebase-scan.test.js):
  - Verifies that the codebase scanner script safely ignores protected secret patterns (`.env*`, `.vars*`, keys, tokens) and refuses to write reports to symlinks or external paths.
