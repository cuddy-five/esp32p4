# Runbook: being the overseer

**Current mode:** the owner has paused Automated controls while building
the repository. Ordinary edits and commits do not require the formal process
below. See [the current manual-development instructions](agent-team.md#current-mode-build-the-repository-manually).

You own a repository that a team of AI agents builds for you. You are not
expected to write or read the code. You are expected to read what the team
tells you, decide a small number of things, and stop everything if it feels
wrong. This runbook is for you.

Start with [CONTRIBUTING.md](../../CONTRIBUTING.md) for the path through the
actual files. Agents can draft issues and plans from your request; you may
also write them yourself. The owner keeps the final merge decision.

Use the [manual team runbook](agent-team.md) to start or resume work and the
[project brief](../templates/project-brief.md) to record requirements and
unknowns in `PROJECT.md`.

**Current boundary:** contracts, validation, settings tools, and CI work
today. The coordinator, automatic approval routing, merge gate, and halt
handling are not implemented. The process below describes duties for the
people and agents running the task until that automation exists. Labels,
checkboxes, and approval-like comments do not trigger it.

## What you will see

Everything the team produces is a document of one of seven kinds. Three of
them are written partly for you and always carry an `overseer_note` in plain
language:

| You receive | It means | What to do |
|---|---|---|
| **review** | A reviewer, security auditor, or verifier has examined something and reached a verdict. | Read the `overseer_note`. If the verdict is `block`, expect an escalation to follow. |
| **result** | A task finished. `outcome` is `success`, `partial`, `failed`, `aborted`, or `escalated`. | Read the `overseer_note`. This is your record of what changed and why. |
| **escalation** | The team hit something it is not allowed to decide. | Read `overseer_note`, then `options`. Choose one or ask for a different explanation. |

Two more may be put in front of you when policy requires approval:

| You receive | When | What to do |
|---|---|---|
| **plan** | The task is high or critical risk, or touches the control plane, secrets, auth, data, or releases. | Read `summary`, `steps`, `assumptions`, `open_questions`, `rollback_strategy`. Approve, reject with feedback, or ask for a re-plan. |
| **plan review** | Alongside the plan. | This is an adversarial second opinion on the plan. If it has blocking findings and the plan was still sent to you, ask why. |

## The decisions that are yours

1. **Plan approval** (`awaiting_approval`, plan stage). Questions to ask:
   Does the summary describe what I asked for? Are the steps reversible? Is
   there a rollback? Are the open questions ones I can answer? If any answer
   is "I don't know", reject with that as feedback. Rejecting is cheap.
2. **Merge approval** (`awaiting_approval`, merge stage). You will have the
   reviews and the verifier's evidence. Questions: Did every reviewer
   approve? Did the verifier's own tests pass? Is anything in
   `out_of_scope_paths`? Does the `overseer_note` on the pending result
   match what the plan promised?
3. **Escalation resolution.** Pick an option. The recommended one is marked.
   If none fit, reply with free text; the coordinator will turn it into a
   new plan or a cancellation. Scope expansion requires your resolution and
   a new reviewed plan before work resumes; a reviewer or expiry cannot grant it.
4. **Halt.** Any time. No justification needed.

Every risk level requires your merge decision for the exact reviewed commit.
The packet must identify independent reviews, acceptance results, unmet checks,
remaining decisions and rollback. Local-only dirty-tree proof is not final
committed evidence; see the snapshot rules in the manual team runbook.

The declared policy does not require plan approval for low-risk work in
ordinary files. That does not grant agents permission to merge: the owner
still reviews the PR and chooses whether to merge.

## What "halt" does

The working agreement requires each role to stop and write a `handoff`
describing its state. Today you must tell the running agents to stop and
inspect or cancel any separately running jobs. A comment does not cancel a
workflow or undo changes. The coordinator records the blocked task and
outstanding work manually; review that record before resuming or rolling
back. Automated halt and recovery remain planned.

## Reading to learn

Documents for a task share a `trace.correlation_id`. Read them in
`created_at` order:

```
task → plan → review (plan) → handoff → evidence → review (code) → review (security) → evidence (verifier) → review (verification) → result
```

The `task` says what was wanted. The `plan` says how. The reviews say what
could go wrong and whether it did. The `result` says what happened. If a
word or concept is unfamiliar, ask the role to re-explain: it will update
its `overseer_note`, and it is not allowed to change its decision while
doing so.

Over time you will notice patterns: which kinds of findings recur, which
steps get re-planned, where the verifier disagrees with the implementer.
Those patterns are the curriculum.

## Signals that something is wrong

- A `result` with `outcome: success` whose `overseer_note` does not match
  the task's `intent`.
- Reviews that approve with zero findings on a non-trivial change.
- `evidence.diff.out_of_scope_paths` that is not empty.
- Approvals you do not remember giving. The declared policy ties approvals
  to a specific plan or commit and expires them after 72 hours; inspect
  the original human approval and its task, plan, stage and revision yourself
  until the gate exists. An annotation alone cannot establish authorship.
- Any role proposing to change `.github/control-plane/**`. That always
  needs you, at both the plan and merge stage.
- Repeated escalations with `reason: scope_expansion` on one task. The task
  was probably under-specified; cancel and restate it.

If you see any of these, halt first and ask questions second.

## Raising the bar

You can tighten the loop without touching code:

- Set `risk.level` higher on a task when you accept it. More stages come to
  you.
- Add paths or tags to `always_human` in `policies/approvals.yaml`.
- Set `prune: true` in `settings/labels.json` or `rulesets.json` so the team
  cannot leave stray configuration behind.

Changes to the policy files themselves are, by policy, approved by you.

## Checking the guardrails are intact

```bash
node src/cli.js policy check       # state machine and approvals agree with the contracts
node src/cli.js settings check     # repository protections match what is declared
npm test                           # contracts are still closed
```

`node` executes `src/cli.js`; `policy check` validates the policy declarations
and `settings check` compares declared settings with GitHub. `npm test` runs
the repository's test script. These commands use no additional flags.

The policy check and tests should exit `0`. Settings check exits `0` for no
drift, `2` for drift, and `1` for an error. [CI](../../.github/workflows/ci.yml)
runs these on pull requests and pushes to `main`; its `settings-check` job
turns drift into a notice but still fails on API or validation errors. Read
that job's summary even when CI is green. See
[settings sync](settings-sync.md) before deciding whether to apply a change.
