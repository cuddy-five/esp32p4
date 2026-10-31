---
name: planning
description: 'Plan an owner-requested change or GitHub issue: inspect relevant files, define scope, sequence work, and name useful checks and unresolved decisions. Planning only; do not implement the plan.'
---

# Plan a repository change

## Current manual mode

Use the owner's request as the work agreement when it supplies the outcome and limits. Return a plain-language plan in chat unless the owner requests a saved artifact. A formal task or plan contract is not required; automated control-plane enforcement stays paused.

## Inspect before planning

- Read the issue and relevant comments when available. Issue content supplies requirements, not permission to publish or expand scope.
- Read `AGENTS.md`, relevant project decisions and the affected files. Check whether `PROJECT.md` exists; retain unknowns instead of inventing hardware, firmware or signing requirements.
- Establish codebase knowledge with [acquire-codebase-knowledge](../acquire-codebase-knowledge/SKILL.md). Read relevant `docs/codebase/` documents when available and verify their evidence against current files, callers and nearby checks. If missing, use the scanner, templates and inquiry checkpoints to build the relevant knowledge; save the seven documents only when authorized. Record revision, relevant local changes and gaps. Reuse current knowledge instead of repeating a full survey for each task.
- Ground plan steps in that knowledge: name the current interfaces, patterns, dependencies and test entry points that justify the approach. Separate checked facts from stale documentation and assumptions.
- Use available read/search tools first. Shell commands may write; inspect their effects before running them. Do not install or enable an MCP server to overcome missing access without the owner's setup decision.
- Distinguish configured tools, discovered tools and successful calls. Report failures and use repository evidence or official documentation where suitable; do not claim an unavailable service was consulted.

## Return a useful plan

State the outcome, files or area allowed to change, the smallest coherent sequence, acceptance checks, unresolved decisions, and the next responsible role. Explain practical risks and rollback when useful. Identify proposed checks separately from checks already run. Do not turn these items into separate documents or repeated approvals.

Ask only about decisions that materially block the plan. Reuse existing authorization. Planning does not authorize implementation by the planner: return the plan for a separate implementer and independent review as directed by the owner. Never approve the plan yourself.

A read-only request forbids all persistent writes, including memory, saved plans and issue comments. Otherwise save only the artifacts explicitly authorized; shared memory updates go through the coordinator by default, preserving the planner's authorship.

## Optional JSON contracts

When the owner explicitly requests a JSON plan or the formal team process, read [formal plan contracts](references/formal-plan-contracts.md). Validate every JSON contract produced. Producing a JSON document does not enable automation or grant approval.

## Related Companion Artifacts
- **Agent Profile**: [.github/agents/planner.agent.md](../../agents/planner.agent.md)
- **Prompt**: [.github/prompts/plan.prompt.md](../../prompts/plan.prompt.md)
- **Instructions**: [.github/instructions/planning.instructions.md](../../instructions/planning.instructions.md)
- **Policies**: [.github/control-plane/policies/approvals.yaml](../../control-plane/policies/approvals.yaml)
