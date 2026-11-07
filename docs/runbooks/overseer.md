# Runbook: being the overseer

**Current mode:** repository protections are required; verify live settings separately; automatic team dispatch and
approval routing remain deferred while building the repository. Ordinary edits and commits do not require the formal process
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

**Current boundary:** contracts, validation, settings tools, CI and a gate
evaluator (`gate check`, run by the `task-gate` check on PRs that commit task
records) work today. The evaluator rejects
missing or stale approvals, stale evidence, self-review and out-of-scope paths
in supplied records, but it trusts the producer names in those records. It
reads your approval from a PR comment (below). `task-gate` blocks a merge only
while the declared ruleset is live; `node src/cli.js settings check` shows drift. The coordinator profile exists,
but an automatic dispatcher and runtime halt handling are not implemented. The process below describes duties for the
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

To approve, post a new PR conversation comment with the approval on a line
of its own:

```text
/approve merge task=<task_id> plan=<plan_id> sha=<full head commit SHA>
/approve plan task=<task_id> plan=<plan_id>
```

`gate check --pr <number>` counts the comment only when its author is in
`approval.overseers` in `policies/approvals.yaml`, it is not edited, and it
names the current plan and, at merge, the PR head. A new push or 72 hours
voids it; post a new comment instead of editing. The `task-gate` check prints
the exact line to post once every other gate passes; re-run that check after you post it. GitHub identifies the
account, not the person: an agent with your GitHub token could post one, so
give agents a token that cannot comment, or check the comment yourself.
Copilot CLI ran on its stored login when given an invalid `GH_TOKEN`
(2026-11-07), so a restricted token binds it only when no other login is stored.
Approving does not merge; you still merge in GitHub.
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

## Stopping and resuming

Post `/halt` on the task's PR, on a line of its own; `task=<task_id>` and a
reason are optional. From then on every gate check for that task fails
`no_open_escalation`, and `task status` reports it blocked, until you post
`/resume task=<task_id>`. A halt from an overseer account counts even when
edited or naming another task; a resume must name the task and be a new,
unedited comment. `task status --pr` lists every halt or resume that did not
count and why; re-run `task-gate` to show it on the PR. The comment stops no
process and undoes nothing: stop each thing that runs, then confirm it stopped.

| What runs | Stop it | Confirm it stopped |
|---|---|---|
| A Copilot CLI agent in a terminal | Ctrl-C in that terminal, or `kill <pid>` | `pgrep -ax copilot` no longer lists it |
| A GitHub Actions run, including the Copilot cloud agent | `gh run cancel <run-id>` (find it with `gh run list --status in_progress`) | `gh run view <run-id> --json status,conclusion` shows `completed` / `cancelled` |
| A workflow that must not start again | `gh workflow disable <name>` | `gh workflow list --all` shows `disabled_manually` |

Disabling `merge-gate` blocks every PR, because `task-gate` is a required
check. Re-enable it with `gh workflow enable merge-gate`.

`pgrep -x` matches the process name only; `-f` also matches any command line
that mentions copilot. A killed Copilot run still exits 0. With
`--output-format json` its log ends with an `abort` event and lists the files
it changed under `codeChanges`, and `copilot --resume <session id>` continues it.

Each stopped role should leave a `handoff`; a killed process cannot. Then run
`node src/cli.js task status` (see the [team runbook](agent-team.md#halt-resume-and-rollback)):
it tells you where the task stands from its records and who acts next. It
cannot see running processes, which is why you confirm the stop first. An
action that was interrupted (a push, a comment, a paid run) has an unknown
result until you look; never repeat it blindly.

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
