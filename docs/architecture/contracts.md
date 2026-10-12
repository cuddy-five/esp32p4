# Contracts

Contracts are the typed messages that flow between roles in the control
plane. Every artefact an agent, workflow, or human produces about a unit of
work is one of seven document kinds, each defined by a closed JSON Schema in
`.github/control-plane/contracts/`.

## Why contracts come first

Workflows, agents, and gates are all consumers or producers of these
documents. Pinning their shape before writing any of those means:

- Workflows can be tested against fixtures instead of live agent output.
- A reviewer agent cannot be tricked by an implementer agent's free-form
  prose; it reads structured `evidence` and emits a structured `review`.
- The merge gate has an unambiguous input: a `result` with linked `evidence`
  and `review` documents, not a PR description.
- Schema versions give consumers a stable integration point across releases
  of the control plane.

## The envelope

All contracts extend `common.schema.json#/$defs/envelope`:

| Field | Purpose |
|---|---|
| `contract` | Discriminator, pinned by `const` in each concrete schema |
| `schema_version` | Semver of the contract the document conforms to |
| `id` | Stable identifier (ULID, UUID, or slug), 4–128 URL-safe chars |
| `created_at` | RFC 3339 timestamp |
| `producer` | `{ kind: human|agent|workflow|system, name, role?, model?, run_id?, run_url? }` |
| `trace` | `{ correlation_id, parent_id?, span_id? }` linking documents for one task |
| `annotations` | Bounded string map for extensions that do not warrant a schema change |

`trace.correlation_id` is the task's thread. Every document for a task shares
it; `parent_id` points at the document that caused this one. The examples in
`contracts/examples/` form one complete trace.

## The seven kinds

```
task ──► plan ──► handoff ──► evidence ──► review ──► result
  │                  ▲                                  ▲
  └──────────────► escalation ──────────────────────────┘
```

| Kind | Producer | Consumer | Carries |
|---|---|---|---|
| `task` | intake workflow, human | coordinator, planner | intent, acceptance criteria, scope (paths, tools, network), risk, budget, status |
| `plan` | planner | reviewer (plan review), implementer | ordered steps with kinds, files, tests, dependencies; assumptions; open questions; rollback and verification strategy; required approvals |
| `handoff` | any role | the next role | state snapshot, working ref, artefacts, blockers, next actions, budget remaining, expiry |
| `evidence` | collect-evidence workflow | reviewer, merge gate | checks, tests, diff shape (including out-of-scope paths), policy results, security scans, attestations |
| `review` | reviewer, security auditor | merge gate, implementer | verdict, structured findings (severity, category, path, CWE), acceptance checklist, scope compliance, confidence |
| `result` | merge gate / coordinator | humans, metrics | outcome, outputs (PR, merge SHA), full lineage of ids, acceptance disposition, budget used, errors |
| `escalation` | any role | humans | reason, severity, requested decision, concrete options, deadline and default action, resolution |

## Design rules

**Closed schemas.** Every object with declared properties sets
`additionalProperties: false` or `unevaluatedProperties: false`. A producer
cannot add fields a consumer did not agree to. `tests/security/` fails if a
schema is opened.

**Evidence carries facts, review carries judgement.** `evidence` has no
verdict field; `review` has no raw test counts. A gate that needs both reads
both documents. This keeps collectors cheap and untrusted, and reviewers
accountable.

**Scope is declared on the task and verified on the evidence.**
`task.scope.allowed_paths` and `forbidden_paths` are globs. `collect-evidence`
reports `diff.out_of_scope_paths`; `review.scope_compliance` records whether
the reviewer accepted them.

**Budgets are first-class.** `task.budget` sets ceilings; `plan`,
`handoff`, `evidence`, `review`, and `result` carry `budget_used` or
`budget_remaining` so the coordinator can stop work before the ceiling, not
after.

**Escalations pause, never decide.** An `escalation` lists options and a
`default_action_on_expiry` of `abort_task`, `pause_task`, or
`proceed_with_recommended`. The control plane may only proceed on its own
when the escalation explicitly allows it.

**Identifiers are two-tier.** Document ids use `identifier` (4–128 chars).
Ids scoped to one document (plan steps, acceptance criteria, findings,
options) use `local_id` and may be short slugs like `s1` or `ac-2`.

## Validation

```bash
node src/cli.js validate doc.json              # infers kind from "contract"
node src/cli.js validate doc.json --kind plan  # force a kind
node src/cli.js validate *.json --format json  # machine-readable report
```

In workflows, use the composite action:

```yaml
- uses: ./.github/actions/validate-contract
  with:
    files: out/*.json
```

Errors are reported as JSON pointers (`/findings/0/severity`) with the
offending keyword, deduplicated across `allOf` branches, and sorted.

## Evolving a contract

1. Additive, optional fields: add to the schema and the example, add a test,
   leave `schema_version` major unchanged.
2. Required fields, renames, removals, or enum narrowing: bump the major,
   write an ADR in `docs/decisions/`, and keep the previous schema available
   under a versioned `$id` until consumers migrate.
3. Never loosen a closed object to accept unknown keys. Use `annotations`
   for genuinely ad hoc metadata.
