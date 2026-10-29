---
name: plan
description: 'Prepare a small plan for an owner-requested task or GitHub issue'
agent: planner
tools: ['read', 'search', 'edit', 'execute', 'context7/*']
argument-hint: 'Describe the task or provide an issue link'
---

# Generate Control-Plane Plan Contract

## Current manual mode

Inspect the request and relevant files. Return a short, plain-language plan with scope and checks; do not require a task or plan contract. Automated control-plane enforcement stays paused. The remaining formal workflow is for future use only after the owner requests the automated team.

## Future automated-team Mission
Analyze an accepted `task` contract, research the affected files in the repository, and produce a schema-validated `plan` contract JSON file with step-by-step tests, required approvals, and a rollback strategy.

## Future automated-team Scope & Preconditions
- Requires a valid `task` contract JSON file (`status: "accepted"` or `"planning"`).
- Operates strictly in read-only mode on source code (`src/**`, `tests/**`, `firmware/**`).

## Future automated-team Inputs
- Task Contract Path: `${input:taskFile:.github/control-plane/contracts/examples/task.example.json}`
- Output Plan Path: `${input:outputFile:.runtime/plan.json}`

## Future automated-team Workflow
1. Read `${input:taskFile}` and validate it with `node src/cli.js validate ${input:taskFile} --kind task`.
2. Read `AGENTS.md`, `PROJECT.md`, and `GLOSSARY.md` to align with project constraints.
3. Search the codebase to identify exact files and test suites required for each `acceptance_criteria` item.
4. Verify every touched file matches `task.scope.allowed_paths` and avoids `task.scope.forbidden_paths`. If out-of-scope files are needed, stop and draft an `escalation` contract (`reason: "scope_expansion"`).
5. Run `node src/cli.js policy stages --risk <task.risk.level> --path <file>...` to determine required human approval stages.
6. Write the `plan` contract JSON to `${input:outputFile}` and validate it with `node src/cli.js validate ${input:outputFile} --kind plan`.

## Future automated-team Output Expectations
- A valid `plan` JSON file at `${input:outputFile}` exiting `0` on `node src/cli.js validate`.
- A concise Markdown summary of the steps, risk level, and required approvals.

## Future automated-team Quality Assurance Checklist
- [ ] `plan.task_id` and `plan.trace.correlation_id` match the input `task` contract.
- [ ] Every step includes `id`, `description`, `kind`, `role`, `files_touched`, `tests`, and `reversible`.
- [ ] `node src/cli.js validate ${input:outputFile} --kind plan` exits `0`.
