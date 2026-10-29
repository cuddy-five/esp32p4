---
name: implement
description: 'Implement an owner-requested change, check it, and explain the result'
agent: implementer
tools: ['read', 'search', 'edit', 'execute']
argument-hint: 'Describe the change and relevant files'
---

# Execute Approved Plan Contract

## Current manual mode

Make the small owner-requested change, preserve unrelated work, and run checks appropriate to the change. Summarize the result; no plan contract is required. Automated control-plane enforcement stays paused. The remaining formal workflow is for future use only after the owner requests the automated team.

## Future automated-team Mission
Execute the implementation steps of an approved `plan` contract strictly within `task.scope.allowed_paths`, verify all unit and security tests pass, and emit a validated `handoff` contract for the adversarial reviewer.

## Future automated-team Scope & Preconditions
- `plan.status` MUST be `"approved"`, and if `policies/approvals.yaml` requires a human at the `plan` stage, human approval must be recorded.
- All edits MUST stay inside `task.scope.allowed_paths`.

## Future automated-team Inputs
- Task Contract Path: `${input:taskFile:.github/control-plane/contracts/examples/task.example.json}`
- Approved Plan Path: `${input:planFile:.github/control-plane/contracts/examples/plan.example.json}`
- Output Handoff Path: `${input:handoffFile:.runtime/handoff.json}`

## Future automated-team Workflow
1. Validate `${input:taskFile}` and `${input:planFile}` using `node src/cli.js validate`.
2. For each step in `plan.steps` assigned to `implementer`:
   - Write or update the failing test in `step.tests` first (TDD Red).
   - Implement the minimal code in `step.files_touched` to pass the test (TDD Green).
   - Refactor while keeping tests green and checking `git diff --check`.
3. Run `npm test`, `npm run validate:examples`, and `node src/cli.js policy check`.
4. Write the `handoff` contract (`from_role: "implementer"`, `to_role: "reviewer"`, `state: "in_review"`) to `${input:handoffFile}` and validate it via `node src/cli.js validate ${input:handoffFile} --kind handoff`.

## Future automated-team Output Expectations
- Clean working tree changes restricted to `task.scope.allowed_paths` with all tests passing.
- Validated `handoff` JSON contract at `${input:handoffFile}`.

## Future automated-team Quality Assurance Checklist
- [ ] Zero files modified outside `task.scope.allowed_paths`.
- [ ] `npm test` and `node src/cli.js policy check` exit `0`.
- [ ] `node src/cli.js validate ${input:handoffFile} --kind handoff` exits `0`.
