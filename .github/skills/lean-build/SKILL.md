---
name: lean-build
description: 'Build new behavior as the smallest complete slice that fits the existing design, with explicit non-goals and a stop condition. Use for features, integrations or new commands where overbuilding is a risk. Not for bug fixes (use surgical-patch).'
---

# Lean build

Turn the requested feature into a complete, narrow outcome that fits the
system as it is.

- Derive observable acceptance checks and explicit non-goals from the request
  and the repository. Write them down before you change code.
- Trace the entry point through every layer that owns an invariant: CLI
  command, library module, contract schema, policy, test.
- Deliver one coherent end-to-end path across the responsible layers. Do not
  force the work into one file or a local patch when it belongs elsewhere.
- Reuse an existing seam that fits. Refactor when patching would duplicate
  behavior, weaken ownership or hide the root cause.
- Leave out modes, providers, configuration, extension points and polish that
  the acceptance checks do not need.
- Add a new surface, dependency, service, configuration or migration only when
  acceptance needs it, and state the trade-off.
- Keep the work runnable at each step.

## Repository rules that shape a build

- Runtime dependencies are `ajv`, `ajv-formats` and `yaml`. Adding one needs
  an ADR line (`AGENTS.md`); ask the owner first.
- Contracts are closed. A new field means schema, example and a test together.
- `plan(desired, actual)` stays pure. Mutating CLI commands require `--yes`.
- CLI exit codes are an interface: `0` ok, `1` error, `2` drift or invalid.
- Workflow changes: also load the `github-actions-hardening` skill.

## Proof

Exercise the new path through its real entry point, then run the relevant
gates (`npm test`, `npm run validate:examples`, `node src/cli.js policy check`,
`git diff --check`). Stop when the acceptance checks pass. Report the slice you
built, what you left out on purpose, and what would trigger the next slice. A
separate reviewer and verifier check the work.
