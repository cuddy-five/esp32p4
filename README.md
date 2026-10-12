# Control Plane

A repo-agnostic GitHub control plane for agent-driven software delivery. This
repository is a template: nothing in it assumes a particular language, build
system, or product. Consumer repositories enrol by referencing its reusable
workflows and actions and by declaring desired state in a few JSON files.

## What exists today (foundation)

| Layer | Location | Purpose |
|---|---|---|
| Contracts | `.github/control-plane/contracts/` | Seven closed JSON Schemas (`task`, `plan`, `handoff`, `evidence`, `review`, `result`, `escalation`) plus shared definitions. Every document agents and workflows exchange conforms to one of them. |
| Validator | `src/lib/contracts.js`, `control-plane validate` | Ajv-backed registry that infers contract kind, enforces formats, and reports JSON-pointer error paths. |
| Settings reconciliation | `src/lib/settings/`, `control-plane settings` | Declarative labels and rulesets with `plan`, `check`, `apply`, and `export`. Drift is computed by pure functions and applied through a minimal REST client. |
| Composite action | `.github/actions/validate-contract/` | Validate contract documents from any repository's workflow. |
| Workflows | `.github/workflows/ci.yml`, `settings-sync.yml` | Tests, example validation, workflow lint, non-blocking drift report; plan-on-PR and apply-on-dispatch for settings. |

Everything else under `.github/` carries a `.disabled` suffix and is reserved
for later stages (agent definitions, orchestration, policies, recovery).

## Quick start

```bash
npm ci
npm test

# Validate contract documents
node src/cli.js validate path/to/*.json
node src/cli.js schema list
node src/cli.js schema show evidence

# Repository settings (token from GH_TOKEN, GITHUB_TOKEN, or `gh auth token`)
node src/cli.js settings plan                 # what would change
node src/cli.js settings check                # exit 2 on drift
node src/cli.js settings export labels        # snapshot live state as desired-state JSON
node src/cli.js settings apply --yes          # reconcile
```

Target repository resolution order: `--repo owner/name`, `GH_REPO`,
`GITHUB_REPOSITORY`, then the `origin` remote.

Exit codes: `0` success or no drift, `1` usage or runtime error, `2` invalid
document or drift detected.

## Using from another repository

Validate contract documents produced in a consumer workflow:

```yaml
- uses: <owner>/<control-plane-repo>/.github/actions/validate-contract@v0.1.0
  with:
    files: |
      .control-plane/out/*.json
```

Reconcile a consumer repository's labels from this control plane's CLI:

```bash
GH_TOKEN=... node src/cli.js settings plan --repo other-org/other-repo --only labels
```

Per-repository desired state for consumers (so each repo carries its own
`labels.json`) is part of the next stage, along with the bootstrap installer.

## Desired-state files

`.github/control-plane/settings/labels.json`

```json
{
  "version": 1,
  "prune": false,
  "labels": [
    { "name": "kind:bug", "color": "d73a4a", "description": "Something is broken", "aliases": ["bug"] }
  ]
}
```

`aliases` renames an existing label in place instead of deleting and
recreating it, preserving issue associations. `prune: true` deletes labels
not declared; otherwise they are reported as `unmanaged` and never count as
drift.

`.github/control-plane/settings/rulesets.json`

```json
{
  "version": 1,
  "prune": false,
  "comparison": "declared",
  "rulesets": [ { "name": "...", "target": "branch", "enforcement": "active", "conditions": {}, "rules": [] } ]
}
```

Ruleset bodies mirror the REST representation, so `settings export rulesets`
output can be committed verbatim. `comparison: "declared"` compares only the
fields you declare and tolerates GitHub-populated defaults; `"strict"`
requires an exact match.

## Token requirements

| Operation | Minimum permission |
|---|---|
| `settings plan`/`check` (labels, rulesets) | Metadata: read |
| `settings apply` labels | Issues: write |
| `settings apply` rulesets | Administration: write |

`github.token` in Actions can read both and write labels. Rulesets require a
fine-grained PAT or GitHub App token supplied as `CONTROL_PLANE_TOKEN`.

## Documentation

- `docs/architecture/contracts.md`: contract model and envelope semantics
- `docs/decisions/0001-node-runtime-and-closed-contracts.md`: runtime and schema-strictness decisions
- `docs/runbooks/settings-sync.md`: operating the settings reconciler

## Roadmap

1. Contracts and settings reconciliation (this stage)
2. Reusable checks behind a repo-profile adapter (`scripts/adapters/`)
3. Bootstrap installer for consumer repositories (`scripts/bootstrap/`)
4. Evidence collection and merge gate
5. Agent roles, orchestration, policies, recovery
