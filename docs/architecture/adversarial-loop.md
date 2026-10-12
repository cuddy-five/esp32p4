# The adversarial team loop

This document describes how work moves through the control plane, who does
what, why the roles are set against each other, and where the human sits.
The machine-readable versions are `orchestration/state-machine.yaml` and
`policies/approvals.yaml`; `node src/cli.js policy check` proves they agree
with the contracts.

## Why adversarial

A single agent that writes code and then checks its own code has one set of
blind spots applied twice. A team where one role is rewarded for shipping and
another is rewarded for finding reasons not to ship has two different sets
of blind spots, and only the intersection gets through. Adding a role that
assumes hostility and a role that refuses to trust anyone's evidence narrows
the intersection further.

The control plane's job is to make this structure impossible to skip: roles
are separated by contract, transitions are gated, and the human sees exactly
the decisions the policy says a human should see.

## Roles

| Role | Stance | Reads | Writes | Forbidden |
|---|---|---|---|---|
| coordinator | neutral | everything | `task`, `handoff`, `result`, `escalation` | code, reviews |
| planner | constructive | `task` | `plan` | implementing its own plan |
| implementer | constructive | `task`, approved `plan`, `review` findings | code, `handoff` | editing the plan; reviewing, verifying, or merging its own change |
| reviewer | adversarial | `plan` or `evidence` + diff | `review` (`plan`, `code`) | fixing what it finds; approving without the acceptance checklist |
| security_auditor | hostile | `evidence` + diff | `review` (`security`) | being skipped at risk medium or above |
| verifier | skeptical | `plan`, `evidence` | own `evidence`, `review` (`verification`) | reusing the implementer's test run |
| human | overseer | `overseer_note` on review, result, escalation; plans when asked | approvals, escalation resolutions, halt | being bypassed |

Two deployment rules reinforce the structure:

- **Distinct model families.** Where available, review roles run on a
  different model family than the implementer for the same task
  (`producer.model` records it). Same-family self-review is the dominant
  failure mode of agentic pipelines.
- **No shared memory across the adversarial boundary.** The reviewer does not
  see the implementer's reasoning, only its outputs and evidence. Rationale
  is persuasive; artefacts are checkable.

## Lifecycle

```
proposed ──► accepted ──► planning ──┬──► in_progress ──► in_review ──► verifying ──┬──► done
                                     │        ▲               │            │        │
                                     │        └───────────────┘            │        │
                                     │        ▲   request_changes          │        │
                                     │        └────────────────────────────┘        │
                                     │            verification failed               │
                                     └──► awaiting_approval ◄───────────────────────┘
                                               │  (human)                plan or merge stage
                                               └──► in_progress / done / planning / cancelled

any active state ──► blocked (escalation open) ──► back, by human
any active state ──► cancelled, by human
```

States are exactly `task.status`. Every transition names its actor and its
gates; a transition fires only when the actor matches and every gate holds.

### Stage by stage

1. **Intake (`proposed` → `accepted`).** The coordinator validates the
   `task` document. Scope, risk level, acceptance criteria, and budget are
   fixed here. Changing any of them later requires a resolved escalation.
2. **Planning (`accepted` → `planning`).** The planner produces a `plan`:
   ordered steps, each with kind, files, tests, dependencies, risk, and
   reversibility; assumptions; open questions with defaults; rollback and
   verification strategy.
3. **Plan review.** A reviewer (not the planner) reviews the plan
   adversarially: is scope respected, are the tests real, is the rollback
   credible, does the plan solve the task or a nearby easier one. Verdict
   `request_changes` loops the planner; `approve` continues.
4. **Approval gate (plan stage).** `approvals.yaml` decides whether a human
   must approve the plan. Low risk in ordinary paths: no. Medium: no at this
   stage. High or critical, or any change touching the control plane,
   secrets, auth, PII, or destructive migrations: yes. The task waits in
   `awaiting_approval`; nothing executes.
5. **Implementation (`in_progress`).** The implementer executes the plan
   inside `task.scope`. On completion it emits a `handoff` to the reviewer.
   Evidence is collected mechanically (checks, tests, diff shape,
   out-of-scope paths, policy results, scans). Gates: evidence exists for
   the head SHA, no out-of-scope paths, budget not exceeded.
6. **Review (`in_review`).** The reviewer and, from medium risk up, the
   security auditor each emit a `review`. Findings are structured and
   severity-tagged; blocking findings force `request_changes`, which returns
   the task to the implementer with the findings attached. The implementer
   cannot edit findings, only resolve them. Retries are bounded.
7. **Verification (`verifying`).** The verifier re-runs checks and tests on
   its own, producing its own `evidence`, and emits a `review` of kind
   `verification`. If it disagrees with the implementer's evidence, its
   evidence becomes the record and the task returns to `in_progress`.
8. **Approval gate (merge stage).** `approvals.yaml` is consulted again with
   the actual diff. Medium risk and up, or any always-human path or tag,
   routes to the human, who reads the `overseer_note`s on the reviews and
   the pending result.
9. **Done.** The coordinator emits exactly one `result` linking every
   document in the trace, with an `overseer_note` written for the human.

### Escalation

Any role may emit an `escalation` at any time. The task moves to `blocked`
and stays there until a human resolves or the escalation expires with its
declared `default_action_on_expiry` (`abort_task`, `pause_task`, or
`proceed_with_recommended`). Escalations carry concrete options with one
marked recommended, so the human is choosing, not designing.

Reasons that must escalate rather than be worked around: budget exceeded,
policy violation, ambiguous requirements, repeated failure, security
concern, human approval required, scope expansion, external dependency,
conflicting reviews.

## Where the human sits

The human is **not** in the hot path for ordinary work. They are:

- **The approver** at the stages `approvals.yaml` names. Approvals are tied
  to a specific plan id or SHA, come only from a `producer.kind: human`, and
  expire.
- **The decider** on escalations. Options are pre-digested; "explain this
  differently" is a legitimate response and obliges the role to rewrite its
  `overseer_note` without changing its decision.
- **The kill switch.** Halt is total and always safe: every role stops,
  emits a `handoff` describing exact state, and does nothing further.
- **The reader.** Every `review`, `result`, and `escalation` carries an
  `overseer_note` in plain language. Reading them in trace order is how the
  human learns what the team did and why.

The system is designed so that a human who approves nothing and reads
everything still gets a safe outcome: low-risk work completes under the
adversarial loop, and anything riskier waits.

## Gates and what implements them

| Gate | Holds when | Implemented by |
|---|---|---|
| `task_valid`, `plan_valid` | Document validates | `control-plane validate` |
| `plan_reviewed` | A plan review from a non-planner approves | coordinator (next stage) |
| `approval_not_required` / `approval_granted` | `approvals.yaml` evaluation; a valid human approval | coordinator + `policy stages` |
| `evidence_collected`, `within_scope`, `within_budget` | Evidence for the head SHA; empty `out_of_scope_paths`; `budget_used` ≤ `task.budget` | collect-evidence (next stage) |
| `reviews_approve` | Latest code review and, when required, security review approve; reviewers distinct from implementer | coordinator |
| `verification_passed` | Verifier's own evidence green and verification review approves | verifier + merge gate |
| `no_open_escalation` | No escalation open or acknowledged | coordinator |
| `retry_budget_remaining` | Review/verify loops under `policies/retries.yaml` | coordinator |

`node src/cli.js policy check` reports how many gates have implementations.

## Invariants

Enforced regardless of path (see `state-machine.yaml#invariants`):

- Separation of duties across every linked document.
- Distinct review model where the deployment allows.
- Approvals only from humans.
- Halt is total.
- Exactly one result per task.
- `overseer_note` on every review, result, escalation (enforced by schema).
- No silent scope change.

## What this stage does not do yet

The state machine and approvals policy are declared and validated but not
yet executed: there is no coordinator process, no evidence collector, and no
merge gate. Those are the next stage. Declaring them first means the
executor is built to a specification the tests already check, rather than
the specification being whatever the executor happens to do.
