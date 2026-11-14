# ESP32-P4 wallet engineering control plane

This repository helps agents build a stateless, air-gapped Bitcoin Blake2b
hardware wallet for the Waveshare ESP32-P4 Touch LCD 3.5. The owner oversees
the work and retains commit and merge decisions. Start with the
[project requirements and current state](PROJECT.md) and the
[wallet development guide](docs/runbooks/wallet-development.md).

For a focused task, run `node scripts/wallet-context.js signing`. `node` runs
the script and `signing` selects its source/check list; it runs no checks and
grants no approval. Use `hardware` for board work or `--help` for all five topics.
The [task worksheet](docs/templates/wallet-task.md) gives agents a small,
concrete assignment. `PROJECT.md` holds the dated snapshot: what is merged,
what is still in a pull request, and the decisions that remain.

The reusable foundation is a template for an **adversarial agentic team loop** on any GitHub
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
`PROJECT.md` to record requirements and owner choices in a new consumer;
this repository's brief is already populated.
New to the agents? Start with
[Using this repository's agents](docs/runbooks/using-agents.md).

The generic baseline also includes CODEOWNERS, security reporting guidance,
and weekly Dependabot proposals after publication to the default branch.
Before using a copy, follow [template adoption](docs/runbooks/template-adoption.md)
to choose its owner, actual protections, reporting contact, and license.

## The loop

This is the intended team process. Roles can follow it manually today;
the automated coordinator is not built. The `merge-gate` workflow's
`task-gate` job checks a PR's committed task records against the merge gates,
including the overseer's `/approve` comment; PRs without records skip it.
A review domain marked `task_required` in `.review-domains.json` removes that
skip for its paths; the `firmware` domain is marked. The `overseer-commands` workflow
re-runs the job when the overseer posts `/approve`, `/halt` or `/resume`.

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
| Scope is declared on the task and verified on the diff | `task.scope.allowed_paths`; `evidence --base` and `gate check --base` read the changed paths from git; the `within_scope` gate | available |
| Checks are observed, not claimed | `evidence --run` runs each check on files equal to the commit and records its real result | available |
| Budgets stop work before the ceiling | `budget` on task; `budget_used` on evidence, review, result; the `within_budget` gate adds them up | gate available; each role still reports its own usage |
| A halt or an approval changes the check at once | `overseer-commands` re-runs `task-gate` when the overseer comments | available; first seen working on 2026-11-14 |
| A sensitive area cannot skip its reviews | `task_required` on a review domain: a PR there fails `task-gate` without task records | available; on for `firmware/**` |
| Humans are told what happened in plain language | `overseer_note` on review, result, escalation | available |
| Finished work cannot sit unseen on a branch | `control-plane overview` lists branches with unmerged work and no pull request | available |
| Mutating anything requires an explicit flag | `--yes` on apply; `settings-sync` applies only on manual dispatch behind an environment | available |

Every file with a `.disabled` suffix, mostly under `.github/`, is a placeholder
for a later stage (agent charters, routing, budgets, tool policy, recovery).

## For the overseer

You are not expected to read the code. You are expected to:

1. Read every `result` and `escalation`. Each carries an `overseer_note`
   written for you, not for another agent.
2. Approve or reject what `policies/approvals.yaml` routes to you. Reject
   when you do not understand; "explain this differently" is a valid reply.
3. Stop the work when something feels wrong. A `/halt` comment on the pull
   request makes the merge gates fail until you post `/resume`, but it stops
   no running process: stop and confirm agents and jobs yourself, as the
   [overseer guide](docs/runbooks/overseer.md#stopping-and-resuming) describes.
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
node src/cli.js policy check                       # state machine, approvals and agent profiles agree with policy

node src/cli.js overview                           # what waits on you: unmerged branches with no PR, open PRs, open issues

node src/cli.js settings plan                      # what would change in this repo
node src/cli.js settings check                     # exit 2 on drift
node src/cli.js settings export labels             # snapshot live state
node src/cli.js settings apply --yes               # reconcile
```

Token: `GH_TOKEN`, `GITHUB_TOKEN`, or `gh auth token`. Target repository:
`--repo owner/name`, `GH_REPO`, `GITHUB_REPOSITORY`, or the `origin` remote.
Exit codes: `0` success or no drift, `1` error, `2` invalid document or drift.
`node src/cli.js help` lists every command, including `evidence` (see
[evidence reporting](docs/runbooks/evidence-reporting.md)) and `compact`.

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
| `.github/control-plane/policies/` | `approvals.yaml`: what requires a human, by risk level and by path; `tool-access.yaml`: proposed role tool access, not enforced |
| `.github/control-plane/settings/` | Desired labels and rulesets for this repository |
| `.github/actions/validate-contract/` | Composite action, usable from any repository |
| `.github/agents/`, `.github/skills/`, `.github/instructions/`, `.github/prompts/` | Copilot agent profiles, project skills, file-scoped instructions, and editor prompts |
| `.github/ISSUE_TEMPLATE/`, `.github/PULL_REQUEST_TEMPLATE.md` | Task/bug intake and the owner's PR reading guide |
| `.github/CODEOWNERS`, `.github/SECURITY.md`, `.github/dependabot.yml` | Review routing, security reporting guidance, and dependency update proposals |
| `.github/workflows/` | `ci.yml`, `settings-sync.yml`, `merge-gate.yml` (the informational `admission-gate` and the required `task-gate`), `overseer-commands.yml` (re-runs `task-gate` on an overseer comment), scheduled `agent-evals.yml` audit, `release.yml`, and the `repo-status` overseer digest (gh-aw `.md` source and generated `.lock.yml`) |
| `.agents.registry.json`, `.skills.registry.json`, `.workflows.registry.json` | Declared role, skill, and workflow catalogues checked by the registry tests |
| `.review-domains.json` | Review checklists selected by changed path |
| `CONTRIBUTING.md` | File-to-file path from request through review and owner merge |
| `src/` | CLI and library (plain ESM, Node 20+) |
| `firmware/` | `no_std` Rust workspace with a pinned toolchain; `scripts/gates/firmware-check.sh` runs its checks. `wallet-core` reads transactions and computes the fork's unified signature hash; it holds no key and signs nothing |
| `tests/unit/`, `tests/security/` | `node:test` suites |
| `docs/agents/` | Issue tracker, triage labels, writing rules, and the registry schema |
| `docs/architecture/` | Contracts, planned team loop, agent memory design, and the team roadmap |
| `docs/codebase/` | Generated codebase knowledge used by the planner |
| `docs/plans/` | Accepted skills-and-tools design and wallet research input |
| `docs/threat-models/` | `adversarial-loop.md` |
| `docs/runbooks/` | Manual team process, agent use and tools, overseer decisions, evidence reporting, settings sync, and template adoption |
| `docs/templates/` | Project brief to copy to `PROJECT.md`, plus upstream agent and prompt examples for the Foundry |
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
3. Evidence collector and merge gate that enforce scope, budget, and approvals (available; budget usage is still self-reported)
4. Agent charters, routing, tool policy, budgets, recovery (charters, tool policy check and recovery reporting available; nothing starts a role automatically)
5. Overseer digest: one place to read what the team did and why (`overview` lists what waits on the overseer; the written `repo-status` digest is paused)
