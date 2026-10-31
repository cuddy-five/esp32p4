# Codebase Concerns

## Core Sections (Required)

### 1) Top Risks (Prioritized)

| Severity | Concern | Evidence | Impact | Suggested action |
|----------|---------|----------|--------|------------------|
| Resolved | Working tree vs index discrepancy: `.github/skills/acquire-codebase-knowledge` | Terminal output from `npm test`, `git status` | Restored skill files to disk and updated `.agents.registry.json` description to conform to lint rules; all 321 tests pass across 52 suites | Complete. No further action needed. |
| Med | Operational reliance on manual team discipline | [PROJECT.md](../../PROJECT.md#L5-L10), [docs/runbooks/agent-team.md](../../docs/runbooks/agent-team.md) | State machine transitions and gate validations are not executed automatically in CI; human or agent errors could bypass intended state order | Keep automated agent jobs paused as instructed; follow the manual runbook until automated coordinator workflows are implemented. |
| Med | GitHub API rate limiting on settings reconciliation | [src/lib/github.js](../../src/lib/github.js#L6-L10) | Excessive `settings plan` or `settings check` polling can exhaust the 5,000 req/hr rate limit | Rely on cached local snapshots or restrict queries with `--only labels` / `--only rulesets`. |
| Low | Monolithic repository path binding | [src/lib/paths.js](../../src/lib/paths.js#L5-L10) | Hardcoded relative directory bindings complicate using the control plane as a standalone external engine across consumer repos | Adopt dynamic root resolution or parameterize engine directories as planned for the consumer setup milestone. |

### 2) Technical Debt

| Debt item | Why it exists | Where | Risk if ignored | Suggested fix |
|-----------|---------------|-------|-----------------|---------------|
| Disabled file placeholders (`.disabled`) | Scaffolded during repository initialization to reserve architecture slots without executing incomplete features | `.devcontainer/*.disabled`, `.github/workflows/*.disabled`, `.github/actions/*/*.disabled`, `.github/hooks/*.disabled` | None (Owner confirmed retaining placeholders as reminders of what is possible to create) | Keep placeholders intact per owner direction. |
| Absence of test coverage reporting | Node's native test runner does not output coverage without additional configuration or tooling | [package.json](../../package.json#L13-L16) | Lack of visibility into untested edge cases or newly added modules | Introduce standard coverage reporting (`node --test --experimental-test-coverage` or `c8`) as agreed. |
| Unmanaged live resource tolerance | GitHub API returns server defaults on rulesets, requiring `declared` comparison mode | [src/lib/settings/rulesets.js](../../src/lib/settings/rulesets.js#L35-L40), [ADR 0001](../../docs/decisions/0001-node-runtime-and-closed-contracts.md) | Undeclared rulesets or settings may drift without triggering alerts unless `prune: true` is explicitly passed | Document declared vs strict expectations in consumer adoption guides. |

### 3) Security Concerns

| Risk | OWASP category (if applicable) | Evidence | Current mitigation | Gap |
|------|--------------------------------|----------|--------------------|-----|
| Ingestion of unvalidated agent properties | A08: Software and Data Integrity Failures | [.github/control-plane/contracts/](../../.github/control-plane/contracts/) | Every schema strictly specifies `unevaluatedProperties: false` or `additionalProperties: false`, validated by [tests/security/contracts-strictness.test.js](../../tests/security/contracts-strictness.test.js) | New schemas or contract revisions must continue to be manually reviewed and tested against strictness suites. |
| Accidental mutation of live GitHub repository | A05: Security Misconfiguration | [src/cli.js](../../src/cli.js#L66), [src/lib/settings/index.js](../../src/lib/settings/index.js) | CLI requires explicit `--yes` flag to apply changes; CI settings sync requires manual workflow dispatch with approval environment | None observed; guard is strictly enforced. |
| Credential leakage in contracts and logs | A02: Cryptographic Failures | [AGENTS.md](../../AGENTS.md#L107) Non-negotiable 9 | Policy forbids secrets in contracts, summaries, and logs; credentials referenced by name only; scanner excludes environment files | Relies on agent and developer adherence; automated pre-commit secret detection is not active. |

### 4) Performance and Scaling Concerns

| Concern | Evidence | Current symptom | Scaling risk | Suggested improvement |
|---------|----------|-----------------|-------------|-----------------------|
| Sequential Git diff parsing | [src/lib/workflow-gate.js](../../src/lib/workflow-gate.js#L30-L50) | In-memory synchronous buffer processing (`maxBuffer: 32MB`) | Very large PRs with tens of thousands of modified files could exceed buffer limits or slow CI | Use streaming diff inspection if repository size grows substantially. |
| In-memory log compaction chunking | [src/compaction.js](../../src/compaction.js#L20-L40) | Splits log strings into lines and chunks in JavaScript memory | Exceptionally large test output logs (>50MB) could cause elevated memory consumption | Enforce input file size ceilings before reading into string memory. |

### 5) Fragile/High-Churn Areas

| Area | Why fragile | Churn signal | Safe change strategy |
|------|-------------|-------------|----------------------|
| `tests/unit/cli.test.js` | Comprehensive CLI integration suite asserting exact exit codes and output text | 9 commits in last 90 days | Run `npm run test:unit` after every CLI modification; maintain exact exit code semantics (`0`, `1`, `2`). |
| `AGENTS.md` | Primary contract and working agreement; changes alter agent permissions, authority, and role boundaries | 7 commits in last 90 days | Treat modifications as high-risk policy changes; requires owner review. |
| `src/cli.js` | Central router for all control plane commands; flag changes impact both local and CI usage | 7 commits in last 90 days | Add targeted unit tests in `tests/unit/cli.test.js` for any new flag or command before changing implementation. |
| `.agents.registry.json` | Registry of configured agents, tools, and model allocations | 6 commits in last 90 days | Validate with `tests/unit/selection-registry-lint.test.js` and `tests/unit/agent-team-config.test.js`. |
| `tests/unit/orchestration.test.js` | Validates state machine states, roles, and gates against contract schemas | 6 commits in last 90 days | Verify contract enums match before editing state machine definitions. |
| `.github/workflows/ci.yml` | Primary gate for PR integration and security checks | 6 commits in last 90 days | Validate changes with `actionlint` and `shellcheck`. |

### 6) Owner Directives and Follow-ups

1. **Working Tree Skill Restoration**: `.github/skills/acquire-codebase-knowledge/` was restored to disk and `.agents.registry.json` linting resolved. All 321 tests pass across 52 suites.
2. **Control-Plane Enforcement Activation**: Full ruleset protection (`settings/rulesets.json`) was updated to `"enforcement": "active"` on default branch and release tags per owner directive.
3. **Dependency Strategy**: Owner confirmed that zero dependencies is not permanent; devDependencies (such as test coverage tools or linting packages) may be introduced when justified.
4. **Placeholders**: Retained all `.disabled` placeholder files across `.devcontainer`, `.github/workflows`, `.github/actions`, and `.github/hooks` as architectural reminders of future capabilities.

### 7) Evidence

- [docs/codebase/.codebase-scan.txt](../../docs/codebase/.codebase-scan.txt)
- [tests/unit/cli.test.js](../../tests/unit/cli.test.js)
- [src/cli.js](../../src/cli.js)
- [AGENTS.md](../../AGENTS.md)
- [PROJECT.md](../../PROJECT.md)
- [.agents.registry.json](../../.agents.registry.json)
- [tests/security/contracts-strictness.test.js](../../tests/security/contracts-strictness.test.js)

## Extended Sections (Optional)

### 8) Agent Pipeline Transition Gaps (Manual -> Autonomous CI Dispatch)

While contracts, schemas, and policies are fully specified, the execution loop is currently manual:
- **Intake**: Creating task issues and initial `task.json` documents relies on manual human or CLI triggers (`node src/cli.js evidence`).
- **Dispatch**: The coordinator currently operates via manual handoff runbooks ([docs/runbooks/agent-team.md](../../docs/runbooks/agent-team.md)) rather than automated GitHub Actions dispatch.
- **Handoff Automation**: Future milestones need to implement automated dispatchers that trigger implementers upon plan approval and reviewers upon handoff emission.

### 9) Hardware Wallet Firmware Research & Verification Gaps

Identified in [.github/instructions/rust-coder.instructions.md](../../.github/instructions/rust-coder.instructions.md) and [docs/plans/esp32_p4_control_plane_hardware_wallet_specification.md](../../docs/plans/esp32_p4_control_plane_hardware_wallet_specification.md):
- **Radio Quarantine**: Research proposes powering down the ESP32-C6 Wi-Fi/BLE module via GPIO/PMIC. Verification is needed to evaluate whether software power-down provides equivalent security to physical removal of radio hardware.
- **Peripherals Compatibility**: Display (ST7796), camera (OV5647), and PMIC (AXP2101) drivers must be verified against actual ESP32-P4 silicon revisions and `esp-hal` `#![no_std]` support.
- **Cryptographic Test Vectors**: Blake2b PoW hardfork consensus rules, UNIFIED_SIGHASH, and BIP-32 derivation must be validated against independently derived test vectors before firmware implementation.
