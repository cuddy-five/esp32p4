# AGENTS.md

Guidance for agents and humans working in this repository.

## What this repository is

A repo-agnostic GitHub control plane distributed as a template. The current
stage is the foundation: contract schemas, a validator, and declarative
reconciliation of repository settings (labels, rulesets). Files with a
`.disabled` suffix are placeholders for later stages; do not enable them
unless the task calls for it.

## Layout

- `.github/control-plane/contracts/` JSON Schemas (`*.schema.json`) and `examples/`
- `.github/control-plane/settings/` desired state for this repository
- `.github/actions/validate-contract/` composite action, usable from any repo
- `.github/workflows/ci.yml`, `settings-sync.yml` enabled workflows
- `src/cli.js` entry point; `src/lib/` library code (ESM, Node 20+, no build step)
- `tests/unit/`, `tests/security/` `node:test` suites; `tests/helpers/` fakes
- `docs/` architecture, decisions (ADRs), runbooks

## Commands

```bash
npm ci
npm test                                   # all suites
npm run test:unit
npm run test:security
npm run validate:examples                  # CLI against the example contracts
node src/cli.js settings plan              # read-only against the origin repo
```

Workflow lint: `actionlint` (download script at
https://raw.githubusercontent.com/rhysd/actionlint/main/scripts/download-actionlint.bash).
CI runs it with shellcheck enabled.

## Conventions

- Plain ESM JavaScript with JSDoc types. No TypeScript build, no bundler.
- Runtime dependencies are limited to `ajv` and `ajv-formats`. Do not add a
  GitHub SDK; `src/lib/github.js` is the client.
- Planning is pure: `plan(desired, actual)` never performs I/O. Side effects
  live only in `fetchActual` and `apply`.
- Contracts are closed: every object schema sets `additionalProperties: false`
  or `unevaluatedProperties: false`. `tests/security/` enforces this. When you
  add a field, add it to the schema, the example, and a test.
- Schema changes that break existing documents bump `schema_version` major in
  the examples and get an ADR.
- CLI exit codes are part of the interface: `0` ok, `1` error, `2` drift or
  invalid. Workflows depend on them.
- Mutating commands require `--yes`. Never relax this.
- Commit per logical change with a descriptive message.

## Testing expectations

- Every new resource under `src/lib/settings/` ships with plan tests covering
  create, update, delete/unmanaged, and an apply test asserting the exact HTTP
  calls via `tests/helpers/fake-github.js`.
- Every new contract or contract field ships with a valid example and at least
  one negative test.
- Run `npm test` and `actionlint` before committing workflow or action changes.

## Cursor Cloud specific instructions

- Node 22 and `gh` are preinstalled; `gh auth token` provides a token, so
  `node src/cli.js settings plan` works read-only without extra secrets.
- Do not run `settings apply` against the origin repository unless the task
  explicitly asks for it.
- `actionlint` and `shellcheck` are not preinstalled; fetch binaries into
  `/tmp` when linting workflows.
