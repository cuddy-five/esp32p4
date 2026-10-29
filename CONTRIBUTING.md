# Contributing

Describe the outcome you want. An agent can prepare the issue, task, plan,
and pull request; the owner reviews the work and decides whether to merge.
You can use the same entry points yourself without writing code or JSON.

This repository supplies reusable control-plane foundations. Keep additions
independent of an application, hardware target, and model provider unless a
task explicitly introduces one. Agents also follow [AGENTS.md](AGENTS.md).

Use the [manual team runbook](docs/runbooks/agent-team.md) for role assignment,
exact revision evidence, halt and resume. Copy the
[project brief](docs/templates/project-brief.md) to `PROJECT.md` when establishing
requirements; leave unresolved choices explicit. New to the roles? Read
[Using this repository's agents](docs/runbooks/using-agents.md).

## Follow one change

<!-- These links are a reading route through the existing files, not a dispatcher. -->
1. **Request.** Use the [task form](.github/ISSUE_TEMPLATE/task.yml) for an
   outcome or the [bug form](.github/ISSUE_TEMPLATE/bug.yml) for a failure.
   Blank issues remain available. Ask an agent to draft one if preferred;
   the owner does not need to author an issue or plan.
2. **Define and plan.** The coordinator turns the request into a
   [task contract](.github/control-plane/contracts/examples/task.example.json)
   with scope and acceptance criteria. A planner writes a
   [plan](.github/control-plane/contracts/examples/plan.example.json), and a
   separate reviewer examines it before implementation. The
   [approval policy](.github/control-plane/policies/approvals.yaml) defines
   which decisions require the human; the people and agents running the
   task must currently enforce that policy themselves.
3. **Implement and hand off.** The implementer follows the reviewed plan
   inside its allowed paths and prepares a
   [handoff](.github/control-plane/contracts/examples/handoff.example.json).
   Use the [PR template](.github/PULL_REQUEST_TEMPLATE.md) to connect the
   change, task, plan, evidence, and remaining risks for the owner.
4. **Review and verify.** Integrate all work and record the exact snapshot.
   Independent roles inspect that same change and rerun
   relevant checks. [Evidence](.github/control-plane/contracts/examples/evidence.example.json)
   records what ran; a [review](.github/control-plane/contracts/examples/review.example.json)
   records the judgement. Mark missing checks or reviews as pending.
5. **Owner decision.** Every merge requires a human. The owner reads the PR, checks, and reviews and
   chooses whether to merge. Agents leave commits to the owner unless
   expressly authorized. A [result](.github/control-plane/contracts/examples/result.example.json)
   records the outcome; the [overseer guide](docs/runbooks/overseer.md)
   explains how to read these records and handle blockers.

Issue Forms and PR descriptions are prose for GitHub readers. They do not
become validated JSON contracts automatically. Contract examples show the
shape of a document, not evidence that work or approval occurred. See
[contracts](docs/architecture/contracts.md) for validation and shared IDs.
Provide reviewers with accessible records; a path inside ignored `.runtime/`
only works for someone sharing that checkout.

## What runs today

[ci.yml](.github/workflows/ci.yml) runs on pull requests, pushes to `main`,
and manual dispatch:

| Job | What it proves |
|---|---|
| `test` | Existing unit/security tests pass, and policy declarations agree with contracts. |
| `validate-examples` | Example JSON documents satisfy their schemas. |
| `lint-workflows` | Active GitHub Actions workflows pass actionlint. |
| `settings-check` | Live settings can be read and compared. Drift is a notice; API/validation errors fail. |

A green run does not prove the complete agent loop ran or that the owner
approved a merge. Intake dispatch, agent routing, approval-comment handling,
evidence collection, and the merge gate are not implemented. Their
`.disabled` files are placeholders. The
[state machine](.github/control-plane/orchestration/state-machine.yaml) and
approval policy describe the intended process; no coordinator executes them.
The [settings-sync guide](docs/runbooks/settings-sync.md) covers the separate
manual workflow for applying repository settings.

## Local checks

With the repository's Node dependencies available, run the existing checks:

```bash
npm test
npm run validate:examples
node src/cli.js policy check
```

`npm test` runs the test script in `package.json`; it has no options.
`npm run` runs a named script, here `validate:examples` for the example
contracts. `node` executes `src/cli.js`; `policy check` asks the CLI to
check that state-machine and approval declarations agree with the schemas.
These commands take no additional flags and do not change GitHub settings.
Workflow edits also need actionlint, as required by `AGENTS.md`.

The [original skeleton prompt](docs/architecture/skeleton-prompt.md) records
why these directories exist. It is historical context, not current working
instructions.
