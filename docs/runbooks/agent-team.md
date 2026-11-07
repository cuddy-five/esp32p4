# Runbook: a human-directed agent team

## Current mode: build the repository manually

For ordinary
owner-directed work, make small changes, run relevant checks, and let the owner
commit or merge.

To resume automation, the owner must request it. Review the workflow, access,
spending and protection settings before enabling the relevant pieces. Do not
turn everything back on merely because the files are present.

## Current fundamental contracts

Use the [fundamental work agreement](../../AGENTS.md#fundamental-work-agreement):
outcome, scope, checks, handoff/results and owner authority in plain language.
Do not turn each item into a separate form. Existing JSON contracts are optional
unless explicitly requested; the future process below is not the default.

## Future team process

Use this process to start, hand off, or resume one task. The owner describes
the outcome; agents prepare the records and work; the owner decides every
merge. [CONTRIBUTING.md](../../CONTRIBUTING.md) connects the GitHub entry
points. This runbook uses the existing [contracts](../architecture/contracts.md)
and [approval policy](../../.github/control-plane/policies/approvals.yaml).
There is no running dispatcher. People and agents must uphold these working
agreements. `node src/cli.js gate check` evaluates one transition's gates over
the task's records. The `task-gate` job in `merge-gate.yml` runs it on every
PR that commits records to `.github/control-plane/records/<task_id>/`. Commit
the records after the reviewed commit, in commits that touch only that
directory; evidence and reviews then name the last code commit, and the merge
approval names the PR head. It trusts producer names in the records. Human
approval counts only from an overseer's `/approve` PR comment, which `--pr`
reads from GitHub.

A successful report is not proof of task scope or completed reviews, and it grants no merge permission. Agents never post `/approve` comments.

## 1. Establish the project and task

Copy [the project brief](../templates/project-brief.md) to `PROJECT.md` at
the repository root. Fill it with the owner, retaining explicit unknowns.
Record intended users, outcome, constraints, owner decisions, acceptance
criteria and real check commands. A repository name supplies no product,
hardware, language or deployment requirements.

The coordinator turns the request into a
[task](../../.github/control-plane/contracts/examples/task.example.json):
scope, risk, budget, acceptance criteria and verification method. Record
commit, publication, installation and remote-operation authority explicitly.
Issue prose is input; it is not a validated contract or permission by itself.
Finish intake when the task is valid and material unknowns are resolved or
recorded as blockers in an [escalation](../../.github/control-plane/contracts/examples/escalation.example.json).

## 2. Plan, review and route approval

A planner produces a [plan](../../.github/control-plane/contracts/examples/plan.example.json)
with steps, owned paths, checks and rollback. A separate reviewer records a
plan [review](../../.github/control-plane/contracts/examples/review.example.json).
The coordinator evaluates required stages using task risk, paths and tags.
Both planning routes require a valid, reviewed plan and no open escalation:
`approval_required` routes to the human; `approval_not_required` routes to
implementation. These are declared gates, not an executing coordinator.

Use existing authorization only when it covers this task, current plan and
required stage and remains valid under policy. Check the original human
record, an overseer's `/approve` PR comment, not a copied approval annotation. Human approval expires after 72
hours and is invalidated as the policy specifies. Scope expansion requires
human resolution of a `scope_expansion` escalation and a new reviewed plan;
a reviewer cannot waive it, and expiry cannot authorize it.

## 3. Assign separate roles and integrate

Keep the planner separate from implementers. Assign independent code review,
security audit (required for medium risk and above, and for files in an
enabled review domain that names the security auditor), and verification; a
producer cannot approve, audit or verify its own artifact. Use another model
family for review where available, and record when that independence is
unavailable. Give reviewers artifacts and criteria, not implementer scratch.

Parallel implementers need disjoint write ownership. Each follows its assigned
steps and sends a [handoff](../../.github/control-plane/contracts/examples/handoff.example.json)
with changed files, actual checks, failures and remaining work. Implementers
may run tests; those runs do not replace independent verification. Integrate
all changes before recording the snapshot that reviewers will examine.

## 4. Bind checks and reviews to the exact work

For committed work, record the actual head commit in `subject.sha`. For an
uncommitted checkout, that field identifies only the base HEAD. Attach a
digest manifest listing changed tracked and relevant untracked artifacts,
their paths and content hashes, plus deletions and file modes. Include the
manifest digest in the contract's artifacts or annotations. Restrict capture
to permitted files; never read secrets or unrelated local state. Label the
packet **local-only, uncommitted**. A change to the snapshot makes its checks
and reviews stale even when HEAD stays the same.

Run the checks specified by the task and project brief, recording commands,
environment, outcomes and logs. For this control-plane repository, the local
baseline is:

```bash
npm test
npm run validate:examples
node src/cli.js policy check
node src/cli.js validate path/to/task.json path/to/plan.json
node src/cli.js gate check --discover --base origin/main --head-sha <sha> \
  --pr <number>
git diff --check
```

`npm test` runs the test script; `npm run validate:examples` runs the named
example-validation script. `node` executes `src/cli.js`: `policy check`
checks declaration consistency, and `validate` checks the contract files
given as positional paths (replace them with the actual records). These
commands have no flags, except `gate check`: `--head-sha` names the commit
under decision, `--base` reads its changed paths from git, `--discover` reads
the committed task records from git (or pass record files instead), and `--pr` reads
approval comments from that pull request by the `approval.overseers` logins
in `policies/approvals.yaml`. It refuses a `--head-sha` that is not the PR's
head. Without `--pr`, `approval_granted` fails.
It defaults to the `awaiting_approval -> done` transition and exits `2` when
any gate fails. `git diff --check` checks tracked working changes
for whitespace errors; it does not check untracked files or execute tests.
Use the existing development environment; installations need their own
authorized plan. Workflow changes also need actionlint and shellcheck.

The reviewer and auditor inspect the same integrated snapshot and issue
their own contracts. Resolve blocking findings through the implementer, then
record and review the changed snapshot. After approval, a separate verifier
reruns required checks and creates fresh
[evidence](../../.github/control-plane/contracts/examples/evidence.example.json)
and a verification review. Unavailable toolchains, hardware, credentials or
remote checks stay pending with a reason and owner; never report them passed.
Required unmet checks block completion of that acceptance criterion.

## 5. Give the owner a decision packet

Use the [PR template](../../.github/PULL_REQUEST_TEMPLATE.md) to connect:

- The requested outcome, current task and reviewed plan.
- Exact reviewed revision, acceptance results and independent review links.
- Unmet checks, remaining risks and decisions requiring the owner.
- Rollback steps and effects that reverting files cannot undo.

Ignored `.runtime/` records work only inside the shared checkout. Before a
remote review, put authorized records somewhere those reviewers can access;
do not publish private artifacts without authority. Final published evidence
and reviews must name the actual reviewed commit. If committing or integration
changes the subject, refresh the records before the owner decides to merge.
Every risk level goes from verification to human merge approval. Successful
checks grant no merge authority. The coordinator records the actual outcome
in a [result](../../.github/control-plane/contracts/examples/result.example.json),
including any acceptance left unmet; a local delivery does not claim a merge.

## Halt, resume and rollback

On halt, each role stops and writes a handoff with exact working state,
unfinished actions and blockers. The owner or coordinator must separately
inspect and cancel running jobs; a comment cannot stop a workflow. Preserve
the work so it can be resumed or reversed without losing unrelated changes.

To resume, first confirm what still runs ([overseer guide](overseer.md#stopping-and-resuming)),
then run `node src/cli.js task status --discover --base origin/main --head-sha <head> --pr <n>`
(or pass the record files). Before acting on a task, every role runs it; a
halted task waits for the overseer's `/resume`. It reports the task's position from the gates at the
head, the role that acts next, stale reviews and evidence and who redoes them,
open objections and escalations, and repair rounds used. Compare the actual
checkout with the reported head; check authorization, approval freshness and
budget before routing another role.
An interrupted external action is unknown until its outcome is inspected;
never replay it blindly. Missing records or conflicting reviews require an
escalation. Restore only task-owned changes under the plan's rollback steps;
retain unrelated work. The [overseer guide](overseer.md) covers owner decisions,
and [agent memory](../architecture/agent-memory.md) records future recovery design.
