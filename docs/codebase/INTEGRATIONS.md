# External Integrations

## Core Sections (Required)

### 1) Integration Inventory

| System | Type (API/DB/Queue/etc) | Purpose | Auth model | Criticality | Evidence |
|--------|---------------------------|---------|------------|-------------|----------|
| GitHub REST API | REST API (v3) | Fetching and reconciling repository labels and branch rulesets | Bearer Token (`GH_TOKEN`, `GITHUB_TOKEN`, or `gh auth token`) | High (for settings sync); Offline (for local validation) | [src/lib/github.js](file:///var/home/cb/src/esp32p4/src/lib/github.js), [src/lib/settings/index.js](file:///var/home/cb/src/esp32p4/src/lib/settings/index.js) |
| Git CLI | Subprocess / Local CLI | Diff calculation, path resolution, commit verification, and whitespace checks | Local filesystem user permissions | High (for evidence collection and PR workflow gating) | [src/lib/workflow-gate.js](file:///var/home/cb/src/esp32p4/src/lib/workflow-gate.js), [src/evidence.js](file:///var/home/cb/src/esp32p4/src/evidence.js) |
| GitHub Actions Platform | CI/CD Execution Environment | Running CI suites, publishing step summaries, and reporting workflow annotations | Native runner permissions (`contents: read`) | High (for CI/CD gating and status reporting) | [.github/workflows/ci.yml](file:///var/home/cb/src/esp32p4/.github/workflows/ci.yml), [src/lib/report.js](file:///var/home/cb/src/esp32p4/src/lib/report.js) |

### 2) Data Stores

| Store | Role | Access layer | Key risk | Evidence |
|-------|------|--------------|----------|----------|
| Repository Git Tree & Filesystem | Primary persistence for contract documents, state machine definitions, policies, and settings | Node `node:fs` API and Git CLI | Dirty working tree or uncommitted files leading to invalid scope/diff calculations | [src/lib/paths.js](file:///var/home/cb/src/esp32p4/src/lib/paths.js), [src/evidence.js](file:///var/home/cb/src/esp32p4/src/evidence.js) |
| Remote GitHub Repository Metadata | Authoritative live state for repository labels and branch protection rulesets | `GitHubClient` REST transport | API rate limits, transient network partitions during reconciliation | [src/lib/github.js](file:///var/home/cb/src/esp32p4/src/lib/github.js), [src/lib/settings/labels.js](file:///var/home/cb/src/esp32p4/src/lib/settings/labels.js) |

### 3) Secrets and Credentials Handling

- Credential sources: Environment variables (`GH_TOKEN`, `GITHUB_TOKEN`) or GitHub CLI authentication tokens (`gh auth token`).
- Hardcoding checks: Zero tokens, passwords, or secret keys exist in tracked files. Contract schemas forbid undeclared credential fields.
- Protection boundary: Repository policy strictly excludes inspection or reading of `.env`, `.vars`, `.env.example`, `.vars.example`, SSH keys, or API tokens ([AGENTS.md](file:///var/home/cb/src/esp32p4/AGENTS.md#L107), [README.md](file:///var/home/cb/src/esp32p4/README.md#L111)).
- Rotation & lifecycle: Tokens are ephemeral in CI (`GITHUB_TOKEN` expires after job completion); local development uses user-managed personal access tokens.

### 4) Reliability and Failure Behavior

- Retry/backoff behavior: Implemented in [src/lib/github.js](file:///var/home/cb/src/esp32p4/src/lib/github.js#L6-L10). Retries with exponential backoff on retryable HTTP statuses (`429`, `500`, `502`, `503`, `504`).
- Safety on non-idempotent methods: Retries are strictly limited to idempotent methods (`GET`, `HEAD`, `PUT`, `DELETE`, `OPTIONS`). `POST` or `PATCH` failures are never retried to prevent duplicating resources or corrupting live state ([src/lib/github.js](file:///var/home/cb/src/esp32p4/src/lib/github.js#L8-L10)).
- Timeout policy: GitHub Actions workflows enforce a strict 10-minute timeout ceiling ([.github/workflows/ci.yml](file:///var/home/cb/src/esp32p4/.github/workflows/ci.yml#L20)).
- Circuit-breaker / Fallback: If GitHub API connectivity is unavailable, offline commands (`validate`, `schema`, `policy check`, `compact`) continue to function without network dependencies.

### 5) Observability for Integrations

- Logging around external calls: HTTP requests, endpoints, and error statuses are captured in `GitHubApiError` and formatted for CLI reporting.
- Metrics/tracing coverage: No third-party APM or metrics collectors are installed. Observability is provided via GitHub Actions job logs, `$GITHUB_STEP_SUMMARY` markdown tables, and compact error diagnostics.
- Missing visibility gaps: No proactive alerting or rate-limit consumption telemetry before the rate limit is hit.

### 6) Evidence

- [src/lib/github.js](file:///var/home/cb/src/esp32p4/src/lib/github.js)
- [src/lib/settings/index.js](file:///var/home/cb/src/esp32p4/src/lib/settings/index.js)
- [src/lib/workflow-gate.js](file:///var/home/cb/src/esp32p4/src/lib/workflow-gate.js)
- [src/lib/report.js](file:///var/home/cb/src/esp32p4/src/lib/report.js)
- [.github/workflows/ci.yml](file:///var/home/cb/src/esp32p4/.github/workflows/ci.yml)
- [AGENTS.md](file:///var/home/cb/src/esp32p4/AGENTS.md)

## Extended Sections (Optional)

### 7) Agent MCP & Tool Ecosystem

Agents are configured with scoped tool aliases and MCP server connections:
- **Tool Aliases**: Validated by [`tests/unit/agent-team-config.test.js`](file:///var/home/cb/src/esp32p4/tests/unit/agent-team-config.test.js#L12) against allowed set: `read`, `search`, `edit`, `execute`, `web`, `agent`, `todo`.
- **MCP Servers**:
  - `basic-memory`: Persistent local memory knowledge graph for recording lessons and cross-agent handoffs.
  - `atuin`: Shell command history search without command execution side-effects.
- **Safety Policy**: Silent installation of MCP servers (such as `npx -y`) is strictly prohibited in agent frontmatter ([tests/unit/agent-team-config.test.js](file:///var/home/cb/src/esp32p4/tests/unit/agent-team-config.test.js#L46)).

### 8) Multi-Model Family Independence Strategy

The adversarial team loop relies on model diversity to prevent blind spots:
- Implementer and Planner run primarily on OpenAI / GPT-5.6-Luna.
- Reviewer and Security Auditor run primarily on Anthropic / Claude 3.7 Sonnet.
- This is codified in invariant `distinct_review_model` in [.github/control-plane/orchestration/state-machine.yaml](file:///var/home/cb/src/esp32p4/.github/control-plane/orchestration/state-machine.yaml#L162) and checked during evidence and review generation.

### 9) Hardware Target & Peripheral Integration (Firmware Target)

Specified in [docs/plans/esp32_p4_control_plane_hardware_wallet_specification.md](file:///var/home/cb/src/esp32p4/docs/plans/esp32_p4_control_plane_hardware_wallet_specification.md#L17-L38):
- **Board Target**: Waveshare ESP32-P4-WIFI6-Touch-LCD-3.5 (`ESP32-P4NRW32X`).
- **Camera (Optical Input)**: OmniVision OV5647 over MIPI-CSI for QR scanning. Unchecked QR data is treated as hostile input.
- **Display (Optical Output)**: ST7796 3.5-inch LCD over MIPI-DSI for rendering signed PSBT animated QR codes.
- **Radio Quarantine**: Physical or GPIO-asserted reset/power-down of onboard ESP32-C6 Wi-Fi/BLE module via AXP2101 PMIC to ensure strict air-gap integrity.
