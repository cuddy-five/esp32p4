# Next agent: make consumer setup the next milestone

Written 2026-10-17 UTC for the next agent in this checkout. Read
[AGENTS.md](AGENTS.md), then the
[local handoff contract](.runtime/recovery-fixes/next-agent-template-portability-handoff.json).
The owner requested this note and a recommendation for future development.
The implementation recommendations below need a new scoped task and reviewed
plan under the [manual team process](docs/runbooks/agent-team.md).

## Recover the current state first

The branch is `template/intake-review`; base HEAD at writing is
`c5cd69a9be9ad8602ec2cf3fdee350f2360851d0`. The working tree contains substantial
uncommitted work. Preserve it and compare the live checkout with these records:

- [Local completion](.runtime/recovery-fixes/friction-local-completion.json)
  links the task, plan, independent reviews and verification evidence. The
  recovery and glob/adoption followup are complete locally; the task remains
  `awaiting_approval` for the owner's merge decision.
- That verifier recorded 204 passing tests, examples, policy, contracts and
  supporting checks against the recorded snapshot. The subsequent read-only
  review found no actionable regressions and reran 93 targeted tests across
  orchestration, rulesets and the CLI; all passed, as did the whitespace check.
- Proof covers the recorded revisions. This note and its handoff were added
  afterward. Refresh relevant evidence when the subject changes, including
  before a published revision is presented for merge. Remote CI and live GitHub
  behavior were not exercised in the latest review.

The completed work includes duplicate-ruleset protection before settings writes,
human merge decisions at every risk level, stricter actor checks, globstar
matching, and the manual team/adoption documentation. The CLI validates
declarations; coordinator execution, automatic evidence collection and merge
gating remain planned. See [CONTRIBUTING.md](CONTRIBUTING.md) for what runs today.

The `.runtime/` records are ignored and local to this checkout. If they are
missing, recover their sources before treating the status above as established.
The existing devbox and the working invocation are recorded in
[verification commands](.runtime/recovery-fixes/friction-verifier-final-commands-20261016.json).
Publication, installation, remote mutations and merge retain their existing
authorization boundaries.

## My recommendation

Make it possible to attach this control plane to an existing project safely.
That is the next most useful milestone toward a reusable template: one shared,
versioned engine, with each mission supplying its brief, policies and real checks.
An owner should be able to change missions without copying engine code into the
application or designing the setup process again.

Two concrete obstacles justify this priority. The template occupies root
`package.json`, `src/` and `tests/`, which can collide with an existing project.
[paths.js](src/lib/paths.js) also binds policy and settings to the engine's
installation. Today `--repo` changes only the GitHub destination. The
[adoption guide](docs/runbooks/template-adoption.md) documents both boundaries.

Use these ownership boundaries:

| Piece | Where it belongs |
|---|---|
| CLI, schemas and reusable implementation | A pinned engine checkout, separate from application files for the first delivery path. |
| Mission, constraints, owner choices and acceptance checks | Consumer `PROJECT.md`, using the existing [project brief](docs/templates/project-brief.md). |
| Consumer policy and desired GitHub settings | The consumer's `.github/control-plane/` declarations. |
| Product validation | The consumer's existing commands and manual procedures, with results recorded through the existing evidence contract. |
| GitHub integration | Thin workflows/actions and explicit repository destinations, enabled when that mission needs them. |

Node remains an engine requirement. It should not determine the consumer's
language, package layout or build system. Local contract and policy operations
should work without GitHub access; additional hosting providers can follow an
actual consumer requirement.

## First proposed implementation task

**Outcome:** configure an empty or existing consumer repository, then validate
its declarations with the separately installed engine while preserving its files.

1. **Make the project source explicit.** Design one project-root input
   (a proposed `--project` option, which does not exist today). Keep engine schemas,
   consumer policy/settings and the GitHub API destination distinct. Reuse
   `settingsDir` in [settings/index.js](src/lib/settings/index.js) and the file
   overrides in [orchestration.js](src/lib/orchestration.js). Preserve the current
   engine-repository defaults. An explicitly selected but invalid consumer must
   produce an actionable error instead of falling back to engine declarations.
2. **Add a small initializer.** Preview a deterministic file plan, then require
   `--yes` to write it. Create only the needed brief, declarations and thin entry
   points. Report collisions before any write; preserve existing instructions and
   application files. A second identical run should make no changes. Resolve
   symlinks and destinations safely inside the selected project. Installation and
   remote settings changes remain separate actions.
3. **Use the current mission format.** Start with `PROJECT.md` and existing
   contracts/policy files. Record actual checks, their working directory and
   required environment in the brief. Unknown owner, license, runtime or check
   choices stay visible. Introduce a machine-readable check mapping when a check
   runner needs it; keep task scope, roles and approval rules in their existing
   authoritative documents.
4. **Prove adoption with contrasting consumers.** Use an existing Node project
   with root package/source/test files and a documentation or research project
   with different checks, including a manual acceptance step. Validate both from
   outside their directories using the same engine revision. Run their checks
   through the manual team process and record honest evidence.

Stop this slice when initialization preserves existing files, collisions cause
no partial writes, repetition is a no-op, an explicit project selects the correct
declarations, and both consumers complete one small reviewed task. Missing manual
or environment-dependent checks must remain pending. Check configurations are
inputs to review; parsing one must not execute commands.

These are design suggestions, not available CLI features. Keep the first delivery
path to one pinned engine checkout. The package is currently private, and the
owner's license/distribution choices remain open; resolve those before publishing
an installable release. A new consumer engine reference must identify an existing,
accessible revision.

## After that proof

Use the two consumers to drive a minimal reusable check adapter and setup
diagnostics. Make adoption upgrades reviewable as diffs that preserve consumer
customizations. Then automate evidence collection and the demonstrated manual
role transitions. Reuse the seven contracts throughout. The existing
[agent-memory proposal](docs/architecture/agent-memory.md) is a reference for a
later recovery task, rather than a prerequisite for the first consumer setup.

The measure of success is concrete: an owner supplies a mission brief and real
checks, sees the proposed setup, and completes a small task with trustworthy
evidence without modifying the engine.
