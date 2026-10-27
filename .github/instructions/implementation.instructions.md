---
description: 'Implementation standards for Node.js ESM control-plane modules and contract handlers'
applyTo: 'src/**/*.js,scripts/**'
---

# Implementation Instructions

- You MUST write plain ESM JavaScript targeting Node.js 20+ with JSDoc type annotations and zero build steps.
- **CRITICAL**: You WILL NOT add runtime dependencies beyond `ajv`, `ajv-formats`, and `yaml` without an approved ADR in `docs/decisions/`.
- You MUST keep all settings planners (`plan(desired, actual)`) pure functions with zero filesystem or network I/O.
- You WILL enforce CLI exit code invariants in `src/cli.js`: `0` for success/no-drift, `1` for runtime/usage error, `2` for drift or schema/gate failure.
- You MUST require `--yes` on any mutating CLI command (`settings apply`, paid live API calls).
- Stay within the owner's requested scope. If using the future contract process, also respect `task.scope.allowed_paths` and do not modify the approved plan.
