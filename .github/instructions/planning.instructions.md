---
description: 'Plain-language planning rules and validation for explicitly requested JSON plans'
applyTo: 'docs/plans/**,**/*plan*.json,.github/control-plane/contracts/**'
---

# Planning instructions

In current manual mode, follow the fundamental work agreement in `AGENTS.md`
and the [planning skill](../skills/planning/SKILL.md). State the outcome, scope,
steps, useful checks, remaining questions and next role in plain language.
Reuse the owner's request; do not require extra documents or repeated approval.

The planner does not implement production or test code. Save plan artifacts only
when authorized; read-only work stays in chat. State which checks ran and which
are proposed. Keep review independent from the plan's author.

For explicitly requested JSON plans, use the skill's
[formal reference](../skills/planning/references/formal-plan-contracts.md).
Validate the generated contract against `plan.schema.json`; newly proposed plans
use `status: "proposed"`. Never fabricate approval or required task input.
Formal approval routing applies only when the owner requests that process.

The [planner profile](../agents/planner.agent.md) defines the role;
the [planning prompt](../prompts/plan.prompt.md) is an optional editor entry point.
