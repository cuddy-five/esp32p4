---
name: planning
description: 'Decompose control-plane and ESP32-P4 firmware tasks into schema-valid plan contracts with scope verification, approval routing, step-level tests, and rollback strategies.'
---

# Skill: Control-Plane & Firmware Planning

## Current manual mode

Inspect the request and relevant files, then give a short plan with scope, checks and next step. A formal task or plan contract is not required. Automated control-plane enforcement stays paused. The remaining formal workflow is for future use only after the owner requests the automated team.

## Future automated-team When to Use
Load this skill when turning an accepted `task` contract or GitHub Issue into a `plan` contract (`plan.schema.json`) during the `planning` state.

## Future automated-team Step-by-Step Procedure
1. **Validate Input Task**: Run `node src/cli.js validate <task.json> --kind task` and extract `allowed_paths`, `forbidden_paths`, `risk`, and `acceptance_criteria`.
2. **Compute Required Human Stages**: Run `node src/cli.js policy stages --risk <level> --path <file>...` to determine whether `plan`, `merge`, or `step` human approvals apply under `.github/control-plane/policies/approvals.yaml`.
3. **Verify Scope Boundaries**: Ensure every file in `steps[].files_touched` matches `task.scope.allowed_paths`. Never schedule edits to `.github/control-plane/**` or `.github/workflows/**` unless the task explicitly allows them and human `plan` approval is listed in `approvals_required`.
4. **Enforce Test & Rollback Completeness**: Every `implement` step must name the exact test file in `tests[]` (`tests/unit/*.test.js`, `tests/security/*.test.js`, or `wallet-core` unit tests) and set `reversible: true|false`.
5. **Validate Output**: Run `node src/cli.js validate <plan.json> --kind plan` (must exit `0`).