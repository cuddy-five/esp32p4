# Coding Conventions

## Core Sections (Required)

### 1) Naming Rules

| Item | Rule | Example | Evidence |
|------|------|---------|----------|
| Files | kebab-case with lowercase extensions (`.js`, `.json`, `.yaml`, `.md`) | `workflow-gate.js`, `common.schema.json`, `state-machine.yaml` | [src/lib/workflow-gate.js](../../src/lib/workflow-gate.js), [.github/control-plane/orchestration/state-machine.yaml](../../.github/control-plane/orchestration/state-machine.yaml) |
| Functions/methods | camelCase with descriptive active verbs | `validateFile()`, `loadDesired()`, `isPathInScope()`, `normalizeRepoPath()` | [src/lib/contracts.js](../../src/lib/contracts.js#L54), [src/evidence.js](../../src/evidence.js#L27) |
| Types/interfaces | PascalCase for classes and JSDoc typedefs | `ContractRegistry`, `GitHubClient`, `GitHubApiError` | [src/lib/contracts.js](../../src/lib/contracts.js#L14), [src/lib/github.js](../../src/lib/github.js#L11) |
| Constants/env vars | UPPER_SNAKE_CASE for constants, freezes, and environment variables | `EXIT`, `CONTRACTS_DIR`, `DEFAULT_API_URL`, `GH_TOKEN` | [src/cli.js](../../src/cli.js#L20), [src/lib/paths.js](../../src/lib/paths.js#L5) |

### 2) Formatting and Linting

- Formatter: No external automated JS formatter installed; clean 2-space indentation and clean trailing whitespace enforced via git.
- Linter: `actionlint` with `shellcheck` for GitHub Actions workflow files ([.github/actionlint.yaml](../../.github/actionlint.yaml)).
- Enforced rules:
  - No whitespace errors: enforced by `git diff --check` in CI and local git hooks ([.github/workflows/ci.yml](../../.github/workflows/ci.yml#L56-L57)).
  - Schema closure: every schema prohibits undeclared fields (`unevaluatedProperties: false` or `additionalProperties: false`), verified by [tests/security/contracts-strictness.test.js](../../tests/security/contracts-strictness.test.js).
  - Explicit mutation confirmation: mutating CLI commands require `--yes` ([src/cli.js](../../src/cli.js#L66)).
  - Agent registry linting: Descriptions must follow decision rules starting with `Choose ` and bounded between 40-300 characters ([tests/unit/selection-registry-lint.test.js](../../tests/unit/selection-registry-lint.test.js#L8)).
- Run commands:
  ```bash
  git diff --check
  node src/cli.js policy check
  ```

### 3) Import and Module Conventions

- Import grouping/order: Node built-ins first (with mandatory `node:` protocol prefix), followed by external npm dependencies, followed by local module imports with relative paths.
- Alias vs relative import policy: Strict relative imports only (`./` and `../`). Path aliases (e.g. `@/`) are not supported or configured.
- File extensions: Explicit `.js` extension required on all internal imports (e.g. `import { CONTRACTS_DIR } from "./paths.js"`).
- Public exports/barrel policy: No root index barrel export. Each module exports specific functions and classes. Settings resources are aggregated selectively in [src/lib/settings/index.js](../../src/lib/settings/index.js).

### 4) Error and Logging Conventions

- Error strategy by layer:
  - Transport layer (`src/lib/github.js`): Throws typed `GitHubApiError` capturing status code, method, path, and error body.
  - CLI layer (`src/cli.js`): Catches errors, prints concise `error: <message>` to `stderr`, and exits with standardized exit codes:
    - `0`: Success / no drift
    - `1`: Usage error, exception, or runtime failure
    - `2`: Document validation failure or drift detected
  - Orchestration & policies: Validation issues are collected and returned as structured problem lists rather than throwing immediately, enabling comprehensive reporting.
- Logging style and required context fields:
  - Standard output is reserved for machine-readable output or clean human summaries.
  - Step summaries are written in markdown to `$GITHUB_STEP_SUMMARY`.
  - Workflow error annotations use GitHub format: `::error file={file},line={line}::{message}`.
  - Every `review`, `result`, and `escalation` contract requires an `overseer_note` written in plain language for human comprehension ([AGENTS.md](../../AGENTS.md#L104)).
- Sensitive-data redaction rules:
  - Non-negotiable rule #9: No secrets in contracts, logs, summaries, or commit messages; reference secrets by name only ([AGENTS.md](../../AGENTS.md#L107)).
  - Environment templates (`.env`, `.env.example`, `.vars`, `.vars.example`) are excluded from scanner output and protected from inspection.

### 5) Testing Conventions

- Test file naming/location rule: Co-located in `tests/unit/*.test.js` for unit suites and `tests/security/*.test.js` for security invariant checks.
- Mocking strategy norm: In-memory fakes implementing the exact interface (e.g. [tests/helpers/fake-github.js](../../tests/helpers/fake-github.js)) or Node's native `mock` module from `node:test`. No external mocking libraries.
- Coverage expectation: Pure functions and planning branches require complete test coverage (create, update, rename, delete, noop). Contract schemas require both positive example tests and negative strictness tests.

### 6) Evidence

- [src/cli.js](../../src/cli.js)
- [src/lib/contracts.js](../../src/lib/contracts.js)
- [src/lib/github.js](../../src/lib/github.js)
- [src/lib/orchestration.js](../../src/lib/orchestration.js)
- [tests/security/contracts-strictness.test.js](../../tests/security/contracts-strictness.test.js)
- [AGENTS.md](../../AGENTS.md)

## Extended Sections (Optional)

### 7) Agent Profile & Charter Conventions (`.github/agents/`)

Every agent specification (`*.agent.md`) must satisfy the strict structural rules validated by [`tests/unit/agent-team-config.test.js`](../../tests/unit/agent-team-config.test.js):
1. **YAML Frontmatter Boundary**:
   - `name`: Must match the filename basename (`<name>.agent.md`).
   - `description`: Must be a single line, bounded, and match registry rules.
   - `tools`: Explicit array of permitted tool aliases (`read`, `search`, `edit`, `execute`, `web`, `agent`, `todo`, or scoped tools like `github/*`). Silent installations (`npx -y`) are strictly forbidden.
   - `skills`: Must reference existing skills in `.github/skills/<skill>/SKILL.md`.
   - `handoffs`: List of valid handoff targets referencing known agent names.
   - `include-custom-instructions`: Must be `true` to ensure the agent receives repository rules and AGENTS.md.
2. **Charter Body Structure**:
   - Section 1: Role identity, constructive vs. adversarial stance, and primary duty.
   - Section 2: Input contracts, allowable operations, and explicit prohibitions.
   - Section 3: Handoff criteria and overseer reporting expectations.

### 8) Contract Schema Conventions (`.github/control-plane/contracts/`)

All contract schemas (`*.schema.json`) follow JSON Schema Draft 2020-12 and adhere to invariants enforced by [`tests/security/contracts-strictness.test.js`](../../tests/security/contracts-strictness.test.js):
- **Closed Schemas**: Must declare `"unevaluatedProperties": false` at top level and for every nested object.
- **Contract Discriminator**: Must define `"contract": { "const": "<kind>" }`.
- **String Length Limits**: All free-text strings must declare a `"maxLength"` to prevent denial-of-service / token-budget exhaustion.
- **Bounded Maps**: String maps (e.g. `annotations`) must declare `"maxProperties"`.
- **URL-Safe Identifiers**: IDs (tasks, plans, traces) must match `^[a-zA-Z0-9_-]+$`.

### 9) Downstream Embedded Firmware Conventions (Rust `#![no_std]`)

Specified in [`.github/instructions/rust-coder.instructions.md`](../../.github/instructions/rust-coder.instructions.md) for future wallet code in `firmware/**/*.rs`:
- **Crate Roots**: Mandatory `#![no_std]` and `#![no_main]`.
- **Memory Safety & Crypto Hygiene**:
  - All secret-holding structs MUST implement `zeroize::Zeroize` and `zeroize::ZeroizeOnDrop`.
  - Secrets NEVER derive `Copy`, `Clone`, `PartialEq`, `Eq`, `Hash`, or standard `Debug` (`[REDACTED]` only).
  - Constant-time equality: All comparisons use `subtle::ConstantTimeEq`.
- **Panic-Free Parsing**:
  - `#![deny(clippy::unwrap_used)]`, `#![deny(clippy::expect_used)]`, `#![deny(clippy::indexing_slicing)]`.
  - Untrusted data (QR frames, PSBTs) must be parsed using `.get()` and checked arithmetic (`checked_add`, `checked_mul`).
