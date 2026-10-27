---
name: recover
description: 'Inspect interrupted work and explain how to resume safely'
agent: coordinator
tools: ['read', 'search', 'execute', 'github/*']
argument-hint: 'Describe the interrupted work or link its handoff'
---

# Recover & Reconcile Interrupted Task State

## Current manual mode

Inspect the current checkout and existing handoff. Explain what finished, what remains, and what to do next. Do not replay an external action whose result is unknown. Jev and automated control-plane enforcement stay paused. The remaining formal workflow is for future use only after the owner requests the automated team.

## Future automated-team Mission
Inspect an interrupted or halted checkout against durable control-plane contracts (`task`, `plan`, `handoff`, `evidence`, `review`, `escalation`), verify snapshot integrity and approval freshness, and emit a validated resume `handoff` or `escalation` contract.

## Future automated-team Scope & Preconditions
- Follows `docs/runbooks/agent-team.md` (Halt, resume and rollback) and `docs/architecture/agent-memory.md`.
- Never blindly replays interrupted external mutations.

## Future automated-team Inputs
- Runtime Task Directory or Task File: `${input:taskPath:.github/control-plane/contracts/examples/task.example.json}`
- Output Contract Path: `${input:outputFile:.runtime/recovery-handoff.json}`

## Future automated-team Workflow
1. Locate and validate all existing contracts for the task (`node src/cli.js validate ...`).
2. Compare `git status --porcelain` and `git rev-parse HEAD` against the last recorded `working_ref.sha` or `subject.sha`.
3. Check whether any human approval has expired (>72 hours), been superseded by a new plan, or been invalidated by a changed HEAD SHA (`policies/approvals.yaml`).
4. If state is consistent and within budget, emit a fresh `handoff` contract (`context_summary` 200–400 words) to the next role in `state-machine.yaml`.
5. If records diverge, an external mutation is indeterminate, or reviews conflict, emit an `escalation` contract with concrete `options[]` and an `overseer_note`.

## Future automated-team Output Expectations
- A validated `handoff` or `escalation` JSON contract at `${input:outputFile}`.

## Future automated-team Quality Assurance Checklist
- [ ] Stale evidence or expired approvals (>72h) are marked invalid and queued for refresh.
- [ ] Output contract validates with `node src/cli.js validate ${input:outputFile}`.
