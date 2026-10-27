---
on:
  schedule:
    - cron: "0 13 * * 1,4"
  workflow_dispatch:

permissions: read-all

engine: copilot

safe-outputs:
  create-issue:
    title-prefix: "[Overseer Digest] "
    labels: ["cp:task", "kind:docs"]
    max: 1
---

# Overseer Control-Plane Digest & Status Report

Generate a concise, plain-language status digest for the Human Overseer following the rules in `AGENTS.md` and `docs/runbooks/overseer.md`:

1. **Inspect Current State**:
   - Check open issues and pull requests, especially any carrying `cp:escalation`, `cp:blocked`, `cp:needs-approval`, or `agent-fallback:local` labels.
   - Run `node src/cli.js policy check` and `npm test` to confirm control-plane guardrails are intact.
2. **Write for the Overseer (`overseer_note` style)**:
   - Summarize what merged recently, which tasks or PRs are waiting on a human `plan` or `merge` decision under `.github/control-plane/policies/approvals.yaml`, and any open escalations or settings drift.
   - Use plain, concrete language with direct links to issues and PRs. Never include secrets or raw stack traces.
   - Do not modify code, labels, or approvals.