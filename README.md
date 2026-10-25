# Control Plane

A template for running an **adversarial agentic team loop** on any GitHub
repository, with a human as overseer rather than programmer.

The premise: the software you want to build is beyond what you can write by
hand, but not beyond what you can judge. A team of AI agents plans,
implements, attacks, reviews, and verifies each other's work. The control
plane defines contracts, budgets, scopes, and separation of duties; the
manual team must uphold the controls that are not yet automated.
You read along, decide the few things only a human should decide, and keep
the kill switch.

The control-plane design does not choose a consumer's language, framework,
or product. The current implementation provides a Node CLI, contract
validation, settings reconciliation, and CI. Agent orchestration and
reusable consumer workflows are still planned.

Start with [CONTRIBUTING.md](CONTRIBUTING.md) to follow a request through
the task and bug forms, plan contracts, PR template, checks, and owner review.
Agents can prepare the issues and plans; the owner can also write them.
Use the [manual team guide](docs/runbooks/agent-team.md) to assign roles and
resume tasks. Copy the [project brief](docs/templates/project-brief.md) to
`PROJECT.md` to record requirements and owner choices.
The [original skeleton prompt](docs/architecture/skeleton-prompt.md)
preserves the starting layout and its historical scope.
The [Jev integration reference](docs/architecture/jev.md) records the
TypeSafe System One primitives and the rules for using Jev in repository
routing.

The generic baseline also includes CODEOWNERS, security reporting guidance,
and weekly Dependabot proposals after publication to the default branch.
Before using a copy, follow [template adoption](docs/runbooks/template-adoption.md)
to choose its owner, actual protections, reporting contact, and license.

## The loop

This is the intended team process. Roles can follow it manually today;
the automated coordinator, evidence collector, and merge gate are not built.

```
          ┌────────────────────────────────────────────────────────────┐
          │                        HUMAN OVERSEER                      │
          │   approves required plans and every merge · resolves issues │
          │   reads every result · can halt everything at any time      │
          └───────────────▲───────────────────────────────▲────────────┘
                          │ escalation                    │ approval / result
   issue ──► coordinator ──► planner ──► reviewer(plan) ──► implementer ──► evidence
                                  ▲                                             │
                                  │              ┌──────────────────────────────┘
                                  │              ▼
                                  └── reviewer(code) ◄──► security auditor ──► verifier ──► human merge decision ──► result
```

Roles are structurally adversarial. The implementer wants to merge; the
reviewer is rewarded for finding reasons not to; the security auditor assumes
the change is hostile until shown otherwise; the verifier re-derives the
evidence instead of trusting it. No role may approve its own output, and
review roles should run on a different model family than the implementer so
blind spots do not line up. See `docs/architecture/adversarial-loop.md`.

## Available and planned controls

| Guardrail | Mechanism | Status |
|---|---|---|
| Every message between roles has a fixed, closed shape | JSON Schema contracts (`task`, `plan`, `handoff`, `evidence`, `review`, `result`, `escalation`) | available |
| Agents cannot invent fields a consumer did not agree to | `unevaluatedProperties: false` on every contract; enforced by `tests/security/` | available |
| Task lifecycle is explicit; only named roles may move a task between states | `orchestration/state-machine.yaml` | defined |
| Risk decides how much a human must see | `policies/approvals.yaml`: every risk needs human merge approval; high/critical risk and sensitive paths or tags require earlier decisions | defined |
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
3. Tell the working agents to stop when something feels wrong. Have them
   record their state and inspect any running jobs; automatic halt and
   recovery handling are still planned.
4. Learn as you go. Plans, reviews, and results are written to be read in
   order; `docs/runbooks/overseer.md` explains how.

The owner retains the merge decision. These role and approval rules describe
the working agreement; CI does not yet enforce the full agent loop. Follow
the [overseer guide](docs/runbooks/overseer.md) for the current limits.

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
| `.github/ISSUE_TEMPLATE/`, `.github/PULL_REQUEST_TEMPLATE.md` | Task/bug intake and the owner's PR reading guide |
| `.github/CODEOWNERS`, `.github/SECURITY.md`, `.github/dependabot.yml` | Review routing, security reporting guidance, and dependency update proposals |
| `.github/workflows/` | `ci.yml`, `settings-sync.yml` |
| `CONTRIBUTING.md` | File-to-file path from request through review and owner merge |
| `src/` | CLI and library (plain ESM, Node 20+) |
| `tests/unit/`, `tests/security/` | `node:test` suites |
| `docs/architecture/` | Contracts, planned team loop, Jev reference, and historical skeleton prompt |
| `docs/threat-models/` | `adversarial-loop.md` |
| `docs/runbooks/` | Manual team process, overseer decisions, settings sync, and template adoption |
| `docs/templates/` | Project brief to copy to `PROJECT.md` |
| `docs/decisions/` | ADRs |

## Token requirements

| Operation | Minimum permission |
|---|---|
| `settings plan` / `check` | Metadata: read (rulesets); Issues: read (labels) |
| `settings apply` labels | Issues: write |
| `settings apply` rulesets | Administration: write (`CONTROL_PLANE_TOKEN`) |

## Roadmap

1. Contracts, settings reconciliation, policy declarations, and generic contribution baseline (available)
2. Reusable checks behind a repo-profile adapter; bootstrap installer for consumer repos
3. Evidence collector and merge gate that enforce scope, budget, and approvals
4. Agent charters, routing, tool policy, budgets, recovery
5. Overseer digest: one place to read what the team did and why
