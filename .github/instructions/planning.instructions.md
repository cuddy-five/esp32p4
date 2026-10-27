---
description: 'Contract-driven planning and architectural decomposition rules for the adversarial agent loop'
applyTo: 'docs/plans/**,**/*.plan.json,.github/control-plane/contracts/**'
---

# Planning Instructions

In current manual mode, provide a short plan with the requested scope, useful checks, and next step. Contracts and automated approval routing are not required. The contract instructions below are for the future automated team, after the owner requests it.

- **CRITICAL**: You MUST validate every generated plan against `.github/control-plane/contracts/plan.schema.json` using `node src/cli.js validate <file> --kind plan`.
- You WILL verify that every path in `steps[].files_touched` is permitted by `task.scope.allowed_paths` and excluded by `task.scope.forbidden_paths`.
- You MUST include at least one automated or verifiable test in `steps[].tests` for each implementation step and map steps to `task.acceptance_criteria`.
- You WILL run `node src/cli.js policy stages --risk <level> --path <path>...` to populate `approvals_required` accurately.
- You MUST provide a concrete `rollback_strategy` and `verification_strategy`.
- You WILL NEVER implement production or test code while acting in the planning role.
