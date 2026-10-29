# Control-plane delivery roadmap

This local roadmap reflects the current owner direction. The [GitHub map](https://github.com/cuddy-five/esp32p4/issues/4) and its child issues may still contain superseded scope; no remote updates are part of this cleanup.

1. **Build the Foundry and agent packages — issue #5.** Verify direct selection, profile loading, tools and coordinator delegation in the chosen Copilot client. Write the beginner guide from observed behavior. Independently check the final published revision and record limitations before closing the issue.
2. **Give agents their skills and tools — issue #6.** Configure the agreed skills and MCP connections, verify model access, and record actual results. Installations require a reviewed setup plan.
3. **Make the team follow the control plane.** Trace a small task through planning, independent plan review, implementation, code/security review, verification and the human merge decision. Implement durable records, dispatch, approval validation and scope enforcement in bounded changes.
4. **Make teamwork dependable.** Check stale evidence, missing approval, out-of-scope work, conflicting reviews, bounded repair, interruption and resume. The owner decides when the overall agents phase is complete.

Ordinary owner-directed work remains manual. Do not enable scheduled workflows or repository protections as a side effect of this plan. Production wallet implementation remains later work.

Use the [team design](../architecture/section-one-roadmap-draft.md), [toolbox](agent-team-skills-and-tools-draft.md), [operating limits](../decisions/0003-agent-operating-limits.md) and [manual runbook](../runbooks/agent-team.md). Keep separate role authorship visible; tests and declared contracts alone do not prove enforced approval.
