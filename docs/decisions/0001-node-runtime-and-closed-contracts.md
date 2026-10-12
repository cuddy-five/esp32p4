# ADR 0001: Node runtime, minimal dependencies, closed contracts

Status: accepted
Date: 2026-10-12

## Context

The control plane must run in two places with identical behaviour: inside
GitHub Actions on any consumer repository, and on an operator's machine. It
must work against repositories written in any language, so it cannot assume
the consumer's toolchain. It exchanges structured documents between agents
and workflows, and those documents are the trust boundary.

## Decisions

### 1. Plain ESM JavaScript on Node 20+, no build step

Node is preinstalled on every GitHub-hosted runner and `actions/setup-node`
is ubiquitous. Plain `.js` with JSDoc types means `npm ci && node src/cli.js`
is the entire install, and composite actions can execute the CLI directly
from `github.action_path`. TypeScript was rejected for now because a compile
step in a composite action either commits build output or adds a build to
every consumer run; neither is worth it at this size. Tests use `node:test`.

### 2. Two runtime dependencies: `ajv` and `ajv-formats`

JSON Schema 2020-12 validation needs a real implementation. Everything else
(HTTP, diffing, pagination, CLI parsing) is written against Node built-ins.
Octokit was rejected: the client needs five methods, and a thin `fetch`
wrapper is easier to fake in tests and to audit.

### 3. Contracts are closed schemas

Every object with declared properties forbids unknown keys
(`additionalProperties: false` or `unevaluatedProperties: false`).
Extensibility is provided by a bounded `annotations` string map on the
envelope, not by open objects. `tests/security/` enforces this invariant so
it cannot regress silently.

### 4. Reconciliation is plan/apply with pure planners

Each settings resource exposes `plan(desired, actual)` as a pure function;
I/O lives only in `fetchActual` and `apply`. Mutations require `--yes`.
Undeclared live resources are reported as `unmanaged` and do not count as
drift unless `prune: true`.

### 5. Rulesets compare in `declared` mode by default

GitHub returns server-populated defaults on rulesets (for example
`allowed_merge_methods`, `required_reviewers`, `integration_id`). Requiring
operators to declare all of them makes desired-state files brittle across
API changes. `declared` mode compares only declared keys; `strict` is
available per file.

## Consequences

- Contributors need Node 20+ and nothing else.
- Adding a dependency is a deliberate act that should be justified in a PR.
- Schema changes that add required fields or rename keys are breaking and
  need a major `schema_version` bump plus an ADR.
- A `PUT` on a ruleset in `declared` mode resets undeclared fields to GitHub
  defaults. This is intentional: what is not declared is not managed.
