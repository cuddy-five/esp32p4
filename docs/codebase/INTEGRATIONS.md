# External Integrations

## Core Sections (Required)

### 1) Integration Inventory

| System | Type (API/DB/Queue/etc) | Purpose | Auth model | Criticality | Evidence |
|--------|---------------------------|---------|------------|-------------|----------|
| GitHub REST API | REST API (v3) | Fetching and reconciling repository labels and branch rulesets | Bearer Token (`GH_TOKEN`, `GITHUB_TOKEN`, or `gh auth token`) | High (for settings sync); Offline (for local validation) | [src/lib/github.js](../../src/lib/github.js), [src/lib/settings/index.js](../../src/lib/settings/index.js) |
| Git CLI | Subprocess / Local CLI | Diff calculation, path resolution, commit verification, and whitespace checks | Local filesystem user permissions | High (for evidence collection and PR workflow gating) | [src/lib/workflow-gate.js](../../src/lib/workflow-gate.js), [src/evidence.js](../../src/evidence.js) |
| GitHub Actions Platform | CI/CD Execution Environment | Running CI suites, publishing step summaries, and reporting workflow annotations | Native runner permissions (`contents: read`) | High (for CI/CD gating and status reporting) | [.github/workflows/ci.yml](../../.github/workflows/ci.yml), [src/lib/report.js](../../src/lib/report.js) |

### 2) Data Stores

| Store | Role | Access layer | Key risk | Evidence |
|-------|------|--------------|----------|----------|
| Repository Git Tree & Filesystem | Primary persistence for contract documents, state machine definitions, policies, and settings | Node `node:fs` API and Git CLI | Dirty working tree or uncommitted files leading to invalid scope/diff calculations | [src/lib/paths.js](../../src/lib/paths.js), [src/evidence.js](../../src/evidence.js) |
| Remote GitHub Repository Metadata | Authoritative live state for repository labels and branch protection rulesets | `GitHubClient` REST transport | API rate limits, transient network partitions during reconciliation | [src/lib/github.js](../../src/lib/github.js), [src/lib/settings/labels.js](../../src/lib/settings/labels.js) |

### 3) Secrets and Credentials Handling

- Credential sources: Environment variables (`GH_TOKEN`, `GITHUB_TOKEN`) or GitHub CLI authentication tokens (`gh auth token`).
- Secret policy: never store secrets in tracked files. Closed contract schemas reject undeclared fields; this does not prove that arbitrary string values contain no secrets.
- Protection boundary: Repository policy strictly excludes inspection or reading of `.env`, `.vars`, `.env.example`, `.vars.example`, SSH keys, or API tokens ([AGENTS.md](../../AGENTS.md), [README.md](../../README.md)).
- Rotation & lifecycle: Tokens are ephemeral in CI (`GITHUB_TOKEN` expires after job completion); local development uses user-managed personal access tokens.

### 4) Reliability and Failure Behavior

- Retry/backoff behavior: Implemented in [src/lib/github.js](../../src/lib/github.js). Retries with exponential backoff on retryable HTTP statuses (`429`, `500`, `502`, `503`, `504`).
- Retry limits: consult [GitHub transport](../../src/lib/github.js). HTTP 429 may be retried for any method; other retryable statuses require an idempotent method.
- Timeouts are workflow-specific; consult the relevant job rather than assuming one repository-wide ceiling.
- Circuit-breaker / Fallback: If GitHub API connectivity is unavailable, offline commands (`validate`, `schema`, `policy check`, `compact`) continue to function without network dependencies.

### 5) Observability for Integrations

- Logging around external calls: HTTP requests, endpoints, and error statuses are captured in `GitHubApiError` and formatted for CLI reporting.
- Metrics/tracing coverage: No third-party APM or metrics collectors are installed. Observability is provided via GitHub Actions job logs, `$GITHUB_STEP_SUMMARY` markdown tables, and compact error diagnostics.
- Missing visibility gaps: No proactive alerting or rate-limit consumption telemetry before the rate limit is hit.

### 6) Evidence

- [src/lib/github.js](../../src/lib/github.js)
- [src/lib/settings/index.js](../../src/lib/settings/index.js)
- [src/lib/workflow-gate.js](../../src/lib/workflow-gate.js)
- [src/lib/report.js](../../src/lib/report.js)
- [.github/workflows/ci.yml](../../.github/workflows/ci.yml)
- [AGENTS.md](../../AGENTS.md)

## Extended Sections (Optional)

### 7) Agent MCP & Tool Ecosystem

The current roster has seven working agents plus Foundry. Profiles declare
intended tools; client availability and successful use require separate checks.
See [Agent tools and setup](../runbooks/agent-tools.md) for dated results,
GitHub, Context7 and Basic Memory access, and rust-analyzer through `lsp`.
NotebookLM setup remains pending in that client. No Atuin integration is declared
by the current agent profiles.

### 8) Model selection and independent review

Profile model entries are requests, not proof of the model used. Use a separate
reviewer and verifier. Ordinary work permits the same model family when another
is unavailable; security-critical review requires a different family. The state
machine declares policy but does not dispatch or authenticate running workers.

### 9) Hardware research candidates

Board, peripherals, signing rules and libraries remain research inputs. Use
[Rust firmware instructions](../../.github/instructions/rust-coder.instructions.md)
and verify sources before selecting hardware or starting firmware work.
