# Control Plane

A template for running an **adversarial agentic team loop** on any GitHub
repository, with a human as overseer rather than programmer.

The premise: the software you want to build is beyond what you can write by
hand, but not beyond what you can judge. A team of AI agents plans,
implements, attacks, reviews, and verifies each other's work. The control
plane holds them to contracts, budgets, scopes, and separation of duties.
You read along, decide the few things only a human should decide, and keep
the kill switch.

Nothing here assumes a language, framework, or product. Consumer repositories
enrol by referencing this repository's workflows and actions and declaring
desired state in a handful of JSON and YAML files.

## The loop

```
          ┌────────────────────────────────────────────────────────────┐
          │                        HUMAN OVERSEER                      │
          │   approves high-risk plans and merges · answers escalations │
          │   reads every result · can halt everything at any time      │
          └───────────────▲───────────────────────────────▲────────────┘
                          │ escalation                    │ approval / result
   issue ──► coordinator ──► planner ──► reviewer(plan) ──► implementer ──► evidence
                                  ▲                                             │
                                  │              ┌──────────────────────────────┘
                                  │              ▼
                                  └── reviewer(code) ◄──► security auditor ──► verifier ──► merge gate ──► result
```

Roles are structurally adversarial. The implementer wants to merge; the
reviewer is rewarded for finding reasons not to; the security auditor assumes
the change is hostile until shown otherwise; the verifier re-derives the
evidence instead of trusting it. No role may approve its own output, and
review roles should run on a different model family than the implementer so
blind spots do not line up. See `docs/architecture/adversarial-loop.md`.

## What the control plane enforces

| Guardrail | Mechanism | Status |
|---|---|---|
| Every message between roles has a fixed, closed shape | JSON Schema contracts (`task`, `plan`, `handoff`, `evidence`, `review`, `result`, `escalation`) | available |
| Agents cannot invent fields a consumer did not agree to | `unevaluatedProperties: false` on every contract; enforced by `tests/security/` | available |
| Task lifecycle is explicit; only named roles may move a task between states | `orchestration/state-machine.yaml` | defined |
| Risk decides how much a human must see | `policies/approvals.yaml`: low risk flows unattended, medium needs a merge approval, high and critical need plan and merge approval | defined |
| Repository protections cannot silently drift | `settings/rulesets.json` and `labels.json`, reconciled by `control-plane settings` | available |
| Scope is declared on the task and verified on the diff | `task.scope.allowed_paths`, `evidence.diff.out_of_scope_paths`, `review.scope_compliance` | contracts available, collector next |
| Budgets stop work before the ceiling | `budget` on task; `budget_used` on evidence, review, result | contracts available, enforcement next |
| Humans are told what happened in plain language | `overseer_note` on review, result, escalation | available |
| Mutating anything requires an explicit flag | `--yes` on apply; `settings-sync` applies only on manual dispatch behind an environment | available |

Everything under `.github/` with a `.disabled` suffix is a placeholder for a
later stage (agent charters, routing, budgets, tool policy, recovery).

## For the overseer

You are not expected to read the code. You are expected to:

1. Read every `result` and `escalation`. Each carries an `overseer_note`
   written for you, not for another agent.
2. Approve or reject what `policies/approvals.yaml` routes to you. Reject
   when you do not understand; "explain this differently" is a valid reply.
3. Halt the loop when something feels wrong. Halting is always safe; the
   control plane never leaves a task in a state that needs a human to clean
   up.
4. Learn as you go. Plans, reviews, and results are written to be read in
   order; `docs/runbooks/overseer.md` explains how.

## Quick start

```bash
npm ci
npm test

node src/cli.js validate path/to/*.json           # validate contract documents
node src/cli.js schema list

node src/cli.js settings plan                      # what would change in this repo
node src/cli.js settings check                     # exit 2 on drift
node src/cli.js settings export labels             # snapshot live state
node src/cli.js settings apply --yes               # reconcile
```

Token: `GH_TOKEN`, `GITHUB_TOKEN`, or `gh auth token`. Target repository:
`--repo owner/name`, `GH_REPO`, `GITHUB_REPOSITORY`, or the `origin` remote.
Exit codes: `0` success or no drift, `1` error, `2` invalid document or drift.

## Using from another repository

```yaml
- uses: <owner>/<control-plane-repo>/.github/actions/validate-contract@v0.1.0
  with:
    files: .control-plane/out/*.json
```

```bash
GH_TOKEN=... node src/cli.js settings plan --repo other-org/other-repo
```

Per-repository desired state for consumers and the bootstrap installer are
the next stage.

## Layout

| Path | Contents |
|---|---|
| `.github/control-plane/contracts/` | Contract schemas and one example per contract on a shared trace |
| `.github/control-plane/orchestration/` | `state-machine.yaml`: task states, transitions, actors, gates, invariants |
| `.github/control-plane/policies/` | `approvals.yaml`: what requires a human, by risk level and by path |
| `.github/control-plane/settings/` | Desired labels and rulesets for this repository |
| `.github/actions/validate-contract/` | Composite action, usable from any repository |
| `.github/workflows/` | `ci.yml`, `settings-sync.yml` |
| `src/` | CLI and library (plain ESM, Node 20+) |
| `tests/unit/`, `tests/security/` | `node:test` suites |
| `docs/architecture/` | `contracts.md`, `adversarial-loop.md` |
| `docs/threat-models/` | `adversarial-loop.md` |
| `docs/runbooks/` | `overseer.md`, `settings-sync.md` |
| `docs/decisions/` | ADRs |

## Token requirements

| Operation | Minimum permission |
|---|---|
| `settings plan` / `check` | Metadata: read |
| `settings apply` labels | Issues: write |
| `settings apply` rulesets | Administration: write (`CONTROL_PLANE_TOKEN`) |

## Roadmap

1. Contracts, settings reconciliation, state machine, approvals policy (this stage)
2. Reusable checks behind a repo-profile adapter; bootstrap installer for consumer repos
3. Evidence collector and merge gate that enforce scope, budget, and approvals
4. Agent charters, routing, tool policy, budgets, recovery
5. Overseer digest: one place to read what the team did and why
