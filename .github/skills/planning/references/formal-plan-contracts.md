# Formal plan contracts

Read this reference only when the owner requests a JSON plan or the formal team process. The current default is the plain-language work agreement. A JSON plan request alone does not enable automation; apply formal approval routing only when the owner requests that process. Never fabricate a task ID or approval to fill a required field. If required input is missing, report it.

## Future Automated-Team Core Principles
1. **Think First, Code Never**: Prioritize codebase discovery, dependency analysis, and constraint verification. You MUST NEVER implement your own plan or modify source/test files (`src/**`, `firmware/**`, `tests/**`).
2. **Evidence-Backed Research**: Use search and reading tools to verify exact APIs, files, and test harnesses before listing a step.
3. **Contract-First Output**: Every plan contract MUST conform to [.github/control-plane/contracts/plan.schema.json](../../../control-plane/contracts/plan.schema.json) (reference golden example at [.github/control-plane/contracts/examples/plan.example.json](../../../control-plane/contracts/examples/plan.example.json)) and validate via `node src/cli.js validate <plan.json> --kind plan`.

## Future Automated-Team Workflow Guidelines
1. **Inspect Task & Domain Context**:
   - Read the input `task` contract conforming to [.github/control-plane/contracts/task.schema.json](../../../control-plane/contracts/task.schema.json) (`task.intent`, `task.acceptance_criteria`, `task.scope.allowed_paths`, `task.scope.forbidden_paths`, `task.risk`).
   - Read [PROJECT.md](../../../../PROJECT.md), [GLOSSARY.md](../../../../GLOSSARY.md), and [docs/decisions/](../../../../docs/decisions/) to verify architectural invariants.
2. **Explore & Bound Scope**:
   - Confirm every file touched in `steps[].files_touched` is permitted by `task.scope.allowed_paths` and excluded by `task.scope.forbidden_paths`.
   - If the task cannot be accomplished within the assigned scope, immediately halt and emit an `escalation` contract conforming to [.github/control-plane/contracts/escalation.schema.json](../../../control-plane/contracts/escalation.schema.json) (`reason: "scope_expansion"`). Hand off to `coordinator`.
3. **Compute Approval Stages via Policies**:
   - Run `node src/cli.js policy stages --risk <task.risk.level> [--tag <tag>]... --path <file>...` to determine required approval gates under [.github/control-plane/policies/approvals.yaml](../../../control-plane/policies/approvals.yaml). Pass every `task.risk.tags` entry as a separate `--tag` argument and every planned file as a separate `--path` argument; omit `--tag` only when the task has no tags. The brackets and ellipses describe repetition; do not type them literally. Tags can require plan approval even when the risk level and paths alone do not.
   - Both `control_plane_self` (.github/control-plane/**, .github/workflows/**, .github/actions/**) and `instructions_and_ownership` (AGENTS.md, .github/agents/**, .github/instructions/**, .github/skills/**, .github/prompts/**, registries) always require human approval at both plan and merge stages.
   - Refer to [.github/control-plane/settings/labels.json](../../../control-plane/settings/labels.json) and [docs/agents/triage-labels.md](../../../../docs/agents/triage-labels.md) for risk and triage label coordination.
4. **Draft the `plan` Contract**:
   - Populate contract envelope headers: `contract: "plan"`, `schema_version: "1.0.0"`, `id: "plan_<ULID>"`, `task_id: "<input-task-id>"`, `status: "proposed"`, `summary: "<markdown>"`, `producer: { kind: "agent", name: "planner", role: "planner", model: "<model>" }`, `trace: { correlation_id: "<from-task>" }`. Newly created plans must always be `status: "proposed"` (a planner may never approve its own plan).
   - Decompose work into atomic `steps[]` with valid `kind` enum values (`investigate`, `implement`, `test`, `refactor`, `document`, `configure`, `migrate`, `verify`, `release`).
   - Every `implement` step must specify exact target files in `files_touched`, verifiable test suites in `tests[]` (`tests/unit/*.test.js`, `tests/security/*.test.js`, or firmware test harness), and set `reversible: true|false`.
   - Document explicit `assumptions`, `open_questions` (with `blocking` and `default_if_unanswered`), `rollback_strategy`, `verification_strategy`, `estimated_budget`, and `approvals_required` (populated from policy stages).
   - Validate output via `node src/cli.js validate <output-plan.json> --kind plan` (e.g., `.runtime/plan.json` or `docs/plans/<name>.plan.json`).
5. **Handoff to Reviewer**:
   - Hand off to `reviewer` with prompt: *"Independently review this plan for scope, useful checks, and practical risks."*

