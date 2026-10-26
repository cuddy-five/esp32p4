# The adversarial team loop

This document describes how work moves through the control plane, who does
what, why the roles are set against each other, and where the human sits.
The machine-readable versions are `orchestration/state-machine.yaml` and
`policies/approvals.yaml`; `node src/cli.js policy check` proves they agree
with the contracts. Follow the [manual team runbook](../runbooks/agent-team.md)
for execution today. Schema validation checks shape; it does not prove
authorship, factual truth, test execution, linked records or human approval.

## Why adversarial

A single agent that writes code and then checks its own code has one set of
blind spots applied twice. A team where one role is rewarded for shipping and
another is rewarded for finding reasons not to ship has two different sets
of blind spots, and only the intersection gets through. Adding a role that
assumes hostility and a role that refuses to trust anyone's evidence narrows
the intersection further.

The design separates roles by contract and declares gated transitions. People
and agents currently uphold that separation: there is no running coordinator
or merge gate. Repository protections enforce only their configured checks.

## Roles

| Role | Stance | Reads | Writes | Forbidden |
|---|---|---|---|---|
| planned coordinator | neutral | everything | `task`, `handoff`, `result`, `escalation` | code, reviews |
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

## Review domains

The reviewer role stays the same when the language changes. What it is
qualified to judge does not. `.review-domains.json` lists those checklists.
`src/review-domains.js` maps changed files to the enabled ones. It does not
launch an agent or approve a merge.

The control-plane checklist is on. The firmware checklist is declared for
no_std Rust, names the security auditor for crypto judgement, and stays off
until a `firmware/` tree exists. A file with no enabled checklist is
uncovered. Do not review it with the control-plane checks. The registered
reviewer has no write paths: judging a change is not permission to edit it.

## Lifecycle

```text
proposed → accepted → planning
planning → in_progress                         (approval_not_required)
planning → awaiting_approval → in_progress      (approval_required; human approves)
in_progress → in_review → verifying
in_review / verifying → in_progress             (changes required; retry budget)
verifying → awaiting_approval → done            (every merge; human approves)
awaiting_approval → planning / cancelled         (human rejects or cancels)
active → blocked → prior permitted state         (escalation; human resolves)
active → cancelled                              (human cancels)
```

States are exactly `task.status`. Every transition names its actor and its
gates; the manual process permits a transition only when its actor matches
and every gate holds. The CLI checks declarations, not running transitions.

### Stage by stage

1. **Intake (`proposed` → `accepted`).** The coordinator validates the
   `task` document. Scope, risk level, acceptance criteria, and budget are
   fixed here. Changing them later requires human resolution of an escalation;
   scope expansion also requires a new reviewed plan.
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
   `awaiting_approval`; nothing executes. The planned `approval_required` and
   `approval_not_required` gates select complementary routes. Both routes
   require `plan_valid`, `plan_reviewed` and `no_open_escalation`. Instruction
   and ownership paths also require human plan and merge decisions.
5. **Implementation (`in_progress`).** The implementer executes the plan
   inside `task.scope`. On completion it emits a `handoff` to the reviewer.
   Today roles collect actual checks, tests, diff paths and policy results
   manually. The planned collector and gates require evidence for the exact
   subject, no out-of-scope paths and a budget not exceeded. Parallel work is
   integrated before review; dirty-tree evidence needs the base HEAD and a
   digest manifest under the manual runbook, and remains local-only.
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
   the actual diff. Every risk level routes from `verifying` to
   `awaiting_approval`, then only the human can authorize `done`. The human
   reads the reviews, independent evidence and proposed outcome for the actual
   reviewed commit. There is no direct verifier-to-done route.
9. **Done.** The coordinator emits exactly one `result` linking every
   document in the trace, with an `overseer_note` written for the human.

### Escalation

Any role may emit an `escalation` at any time. The task moves to `blocked`
and stays there until a human resolves or cancels it. The contract can record
a `default_action_on_expiry` (`abort_task`, `pause_task`, or
`proceed_with_recommended`), but expiry grants no authority to leave the
human-owned state or expand scope. Scope expansion needs human resolution
and a new reviewed plan; reviewers record violations and cannot waive them.
Escalations carry concrete options with one recommended.

Reasons that must escalate rather than be worked around: budget exceeded,
policy violation, ambiguous requirements, repeated failure, security
concern, human approval required, scope expansion, external dependency,
conflicting reviews.

## Where the human sits

Ordinary low-risk work can proceed without a separate plan approval, but
every merge requires the human. They are:

- **The approver** at the stages `approvals.yaml` names. Approvals are tied
  to the exact plan and stage (and commit for merge), originate from the
  authorized human and expire. A `producer.kind: human` field or annotation
  is a claim; the original human approval must be checked manually today.
- **The decider** on escalations. Options are pre-digested; "explain this
  differently" is a legitimate response and obliges the role to rewrite its
  `overseer_note` without changing its decision.
- **The kill switch.** Halt is total and always safe: every role stops,
  emits a `handoff` describing exact state, and does nothing further.
- **The reader.** Every `review`, `result`, and `escalation` carries an
  `overseer_note` in plain language. Reading them in trace order is how the
  human learns what the team did and why.

When the human grants no approval, ordinary preparation can continue within
authorized scope, but every merge waits. Halt is a manual working agreement:
running agents and jobs must be stopped explicitly; no automatic cancellation
or rollback exists yet.

## Gates and what implements them

| Gate | Holds when | Implemented by |
|---|---|---|
| `task_valid`, `plan_valid` | Document validates | `control-plane validate` |
| `plan_reviewed` | A plan review from a non-planner approves | coordinator (next stage) |
| `approval_required` / `approval_not_required` | Plan stage requires / does not require a human | planned coordinator; `policy stages` evaluates required stages only |
| `approval_granted` | Current original human approval covers this task, plan, stage and revision | planned coordinator; manually checked today |
| `evidence_collected`, `within_scope`, `within_budget` | Evidence for the head SHA; empty `out_of_scope_paths`; `budget_used` ≤ `task.budget` | collect-evidence (next stage) |
| `reviews_approve` | Latest code review and, when required, security review approve; reviewers distinct from implementer | planned coordinator |
| `verification_passed` | Verifier's own evidence green and verification review approves | planned verifier integration + merge gate |
| `no_open_escalation` | No escalation open or acknowledged | planned coordinator |
| `retry_budget_remaining` | Review/verify loops below the configured retry budget | planned coordinator |

`node src/cli.js policy check` checks declaration consistency and reports gate
status. `policy stages` calculates required stages from risk, paths and tags;
it neither authenticates approval nor executes a transition. Required unmet
checks remain pending and block the corresponding acceptance criterion.

## Invariants

Declared for every path (see `state-machine.yaml#invariants`); only the noted
schema rule is directly enforced by validation today:

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
