---
name: verification
description: 'Independently re-run control-plane and firmware test suites, collect machine-readable evidence contracts, and evaluate merge-gate readiness.'
---

# Skill: Independent Verification & Evidence Collection

## Current manual mode

Independently run the checks that fit the work and report actual results and unavailable checks. No evidence contract is required. Jev and automated control-plane enforcement stay paused. The remaining formal workflow is for future use only after the owner requests the automated team.

## Future automated-team When to Use
Load this skill in the `verifying` state to independently re-derive `evidence` and emit a `verification` review before the Human Overseer's merge decision.

## Future automated-team Step-by-Step Procedure
1. **Re-Run All Deterministic Checks**:
   - Execute `npm test`, `npm run validate:examples`, `node src/cli.js policy check`, and `git diff --check` in a clean shell.
2. **Generate Standalone Evidence Contract**:
   - Run `node src/cli.js evidence --task <task.json> --sha <head-sha> --base-sha <base-sha> --path <file>... --output <evidence.json>`.
   - Validate `<evidence.json>` via `node src/cli.js validate <evidence.json> --kind evidence`.
3. **Record what actually happened**:
   - Record each command and result and whether the reviewed work matches the subject. The saved evidence file does not contain the separate stdout envelope's `gates`, test results, or complete budget usage. Missing usage is unknown even if the command reports a budget pass. Check review authors and approvals separately; never infer them from schema validity.
   - In future automated operation, produce a verification review only from independently obtained evidence. In current manual mode, report the checks in plain language without requiring a contract.
