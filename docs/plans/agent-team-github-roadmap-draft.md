# GitHub roadmap: build the agent team, then improve it with Jev

This is the owner-confirmed publication copy of one Wayfinder map and seven large GitHub issues. It records the owner's choices; it does not approve future implementation or spending.

Published: [Build the agent team, then improve it with Jev](https://github.com/cuddy-five/esp32p4/issues/4). GitHub holds the current status and named links to all seven child issues. Start with [Build the Foundry and agent packages](https://github.com/cuddy-five/esp32p4/issues/5).

The issues below deliberately explain the work for someone learning GitHub. A large issue holds a useful piece of the roadmap. It can take several work sessions and several pull requests. A pull request is a proposed change that gets reviewed before it becomes part of the main branch.

## Before publishing

The owner requested pausing Jev and automated controls for manual development. GitHub's intake workflow has been disabled and its live state verified. The local `.github/workflows/intake.yml` also removes the issue-open trigger, ready for the owner's commit. Other paused workflows are listed in `docs/runbooks/agent-team.md`. Verify intake is still disabled immediately before publication. Do not inspect secret values or assume a key is absent.

The hosted spending checks still need work. Keeping a manual trigger does not mean paid hosted runs are ready or authorized. Leave the spending amount for later, as requested.

At publication, check for an existing map and matching issues first. Create only missing items, connect them using GitHub's child-issue relationships, and then add true blocking relationships. Replace draft references with links showing each issue's title. Use the repository's documented link fallback only if native relationships are unavailable. Update this review copy with the published map link; GitHub then holds the current work status.

### Labels to use

| Label | Plain meaning |
| --- | --- |
| `wayfinder:map` | The overall roadmap. |
| `area:agents` | Work on the team, its tools or its rules. |
| `area:jev` | Work on Jev's suggestions and permitted decisions. |
| `wayfinder:task` | Work to deliver one of the large roadmap items. |
| `wayfinder:research` | A separate investigation, if we later need one before choosing an approach. |
| `needs-triage` | The work still needs its scope and starting plan checked. |

Use existing `kind:feature` or `kind:docs` labels where they fit instead of inventing another build category. Keep the existing intake and `cp:*` labels for later task status. Do not mark a newly published roadmap issue approved, in progress or ready for an agent just because it exists. Labels describe status; they do not provide permission.

Create only the labels needed by the published issues, preserving unrelated labels. Record new labels in the existing settings file through the normal reviewed change process. Do not apply unrelated repository settings as part of publishing this roadmap.

## Map issue: Build the agent team, then improve it with Jev

Labels: `wayfinder:map`.

### Destination

Build a useful team of agents with clear jobs, the right tools and a shared process you can oversee in GitHub. Then use Jev for selected decisions where it improves the work or saves money. You decide when the agents phase is complete and when to move on.

### Notes

**Work normally while we build this.** Jev and the extra control-plane workflows are paused. Ordinary owner-directed edits and commits do not need the full contract and approval process. Keep changes small, run useful checks, and let the owner decide what to commit or merge. The stricter controls in this roadmap are work for the future automated team. We will not turn them back on without your instruction.

This map includes both planning and delivery. That is an explicit extension of Wayfinder's usual planning-only use: its large task issues stay open until their stated work is delivered or you accept a clearly recorded change of scope. Finishing a design does not mean its implementation is finished.

Start with the child issue **Build the Foundry and agent packages**. Next work on **Give agents their skills and tools**, **Make the team follow the control plane**, and **Make teamwork dependable**. These can overlap where their plans allow it. Jev comes afterward in the agreed order. The roadmap does not choose a deadline or add a completion score for the agents phase.

Use the seven agreed working agents: Coordinator, Planner, Control-plane engineer, Wallet engineer, Reviewer, Security auditor and Verifier. The Foundry creates and improves their packages. The Wallet engineer combines Rust, Bitcoin and ESP32 knowledge. You can use an agent directly or use the coordinator to arrange teamwork.

### What to do next in GitHub

1. Open **Build the Foundry and agent packages** from this map's child issues and read its first step. Assign the issue to the person responsible for that work so other sessions can see it is taken.
2. Give its link to your current agent. Ask it to inspect the files and explain the next small change. A short plan is enough in the current manual mode; an assignment or label does not start a worker.
3. Keep progress and decisions in issue comments. State what changed, what is blocked, and the next action. Link changes and checks so the next session can pick up the work.
4. Commit changes when you choose. Use a pull request when you want a proposed change reviewed before merging it. Read its plain-language summary, checks and remaining limitations. The full contract and approval stages are for the automated team we will build later.
5. Close a large issue only when its completion section is satisfied or you explicitly accept a reduced scope with the remaining work linked. Merging one small pull request need not finish the whole issue. Use a normal related-issue link for partial work so the first merge does not automatically close it.

The current process is partly manual. Follow `docs/runbooks/agent-team.md` and `docs/runbooks/overseer.md`. Nobody should claim that labels, approval-like comments or a passing reporting job prove that automatic enforcement is working.

### Where things are

The team definitions live in `.github/agents/`. Reusable procedures belong in `.github/skills/`; shared instructions in `.github/instructions/`; supported reusable requests in `.github/prompts/`; MCP connection setup in `.github/mcp.json`. MCP connections let agents use services such as GitHub and Basic Memory.

The shared rules and record formats live in `.github/control-plane/`. The code that checks and applies them lives in `src/`. GitHub jobs live in `.github/workflows/`, reusable job steps in `.github/actions/`, and agent-event checks in `.github/hooks/`. The last three should reuse the shared rules rather than maintain competing copies. Some planned files do not exist or are still disabled.

Use `docs/plans/agent-team-skills-and-tools-draft.md` for the agreed toolbox, `docs/decisions/0003-bounded-jev-authority.md` for authority limits, and `docs/templates/` as reference material for the Foundry. Templates are not a second master copy of the working agents.

### Decisions so far

The starting decisions are recorded in `docs/architecture/section-one-roadmap-draft.md` and the linked toolbox document. No child issue has been completed yet. As issues close, add a short result here with a named link to the issue that holds the details.

### Not yet specified

Exact worker commands, usable models and working MCP connections need live checks during agent work. Detailed test cases belong in each scoped plan. Jev spending amounts remain for later, before paid runs. The wallet's board, protocol and library facts need verification before they become specialist instructions.

### Out of scope

Production wallet firmware, automatic switching between providers, unrestricted agent permissions, and autonomous merge or release decisions are not part of this roadmap. Reading wallet references and preparing specialist skills are included.

## Issue: Build the Foundry and agent packages

Labels: `area:agents`, `wayfinder:task`, `kind:feature`, `needs-triage`.

### What we want and why

Give each agent a clear job and a usable definition. Make the Foundry capable of preparing the whole package: instructions, prompts, skills and tool choices. This prevents us from repeatedly explaining the same job or creating separate agents for every subject.

### Where to look

Start with `.github/agents/`, `docs/templates/custom-agent-foundry.agent.md`, `AGENTS.md`, and the agreed toolbox in `docs/plans/agent-team-skills-and-tools-draft.md`. Compare existing files before replacing anything; some are unfinished and some are being edited separately.

### What to do next

Ask the planner to compare the existing profiles with the seven agreed working agents and the Foundry. Prepare a small first plan for correcting the Foundry and one representative package. Use what that reveals to finish the other packages. Keep the two engineering specialties within the existing implementer role.

### Work included

- Define each agent's purpose, limits, expected inputs and outputs, and when to ask for help.
- Give the Foundry a repeatable way to prepare and check the full package, without letting it approve its own output.
- Support direct use and coordinator-led use with the same applicable instructions.
- Verify that Copilot actually discovers the profiles and receives the intended instructions. Clearly mark features not yet supported or tested.
- Explain how the owner selects an agent and where to edit its package later.

### How to use GitHub for this issue

Keep a short progress list in the issue. Link each scoped plan and pull request. A pull request that completes only one agent should reference this issue without closing it. Ask an independent reviewer to check the package and another role to check its behavior before recording it as working.

### What finishes this issue

The Foundry and agreed agent profiles are present, independently reviewed, and shown to load in the chosen client. Their instructions explain their duties and limits. Remaining tool setup is clearly linked to **Give agents their skills and tools**. Record the delivered files, actual checks and any owner-accepted limits in a closing comment. This does not decide when the entire agents phase is complete.

## Issue: Give agents their skills and tools

Labels: `area:agents`, `wayfinder:task`, `kind:feature`, `needs-triage`.

### What we want and why

Give each agent a small, useful toolbox. A skill explains how to do a job; an MCP connection provides tools for another service. An agent needs both the right instructions and access that actually works.

### Where to look

Use `docs/plans/agent-team-skills-and-tools-draft.md` as the starting design. Work in `.github/skills/`, `.github/instructions/`, supported `.github/prompts/` files, `.github/mcp.json`, and the affected agent profiles. Use existing skills and `docs/templates/` as sources to adapt.

### What to do next

Ask the planner to list the skills and tools each agent needs, what already works, and what still requires setup. Start with one agent and verify the full path from its profile to its usable tools before repeating the setup.

### Work included

- Adapt the agreed skills, preserving their sources and licenses. Keep optional skills available without loading the whole library for every task.
- Set up appropriate GitHub, Basic Memory, Context7 and NotebookLM access. Put no secret values in the repository.
- Keep shared Basic Memory writing with the coordinator by default. Preserve the original author of reviews and findings.
- Build shared, checked wallet references for the engineer, reviewer and auditor. Verify the board and signing rules rather than copying unverified claims from a specification.
- Confirm the actual client's permissions and instruction loading. A command tool can write files even when a profile has no separate editing tool.
- Provide a simple table of each agent's tools, their purpose, and whether access was successfully tried.

### How to use GitHub for this issue

Report missing access in an issue comment without pasting credentials. If the owner must complete a setup step, explain the exact action and what success looks like. Link setup changes and live-check results from the pull requests. Do not treat a tool's name in a profile as proof it works.

### What finishes this issue

The agreed agents can use their intended skills and tools in the chosen client, and the access stays within their roles. Shared references have sources. The owner has a readable tool table and setup guide. Unavailable items remain open unless the owner accepts a documented alternative or reduced scope.

## Issue: Make the team follow the control plane

Labels: `area:agents`, `wayfinder:task`, `kind:feature`, `needs-triage`.

### What we want and why

Make the team carry out a task through planning, building, independent review and verification, while you keep the decisions that belong to you. The control plane is the shared set of rules and records for that process. Today, several of those rules are followed manually; written rules alone do not enforce themselves.

### Where to look

Read `docs/runbooks/agent-team.md`, `docs/runbooks/overseer.md`, `.github/control-plane/contracts/`, `.github/control-plane/policies/approvals.yaml`, and `.github/control-plane/orchestration/state-machine.yaml`. Reuse the checking code in `src/` and the existing workflows before adding new pieces.

### What to do next

Ask the planner to trace one small maintenance task from request to human merge decision. Mark each step as working, manual or missing. Use that trace to propose the first bounded implementation. Do not make this depend on Jev; ordinary rules and human direction must remain usable.

### Work included

- Keep durable task records and clear handoffs so the next agent knows what to do.
- Start only the assigned worker with its permitted files, instructions and tools.
- Check required approval against the actual human decision and current plan. Preserve scope limits and separate builder, reviewer, auditor and verifier duties.
- Tie reviews and test results to the actual work being considered for merge.
- Keep one implementation task running at a time; allow independent reviews in parallel where appropriate.
- Use hooks and GitHub workflows to call shared checking code where practical. Report gaps honestly until enforcement exists.

### How to use GitHub for this issue

Use the issue for the overall work and linked plans for each change. The coordinator should point you to the current plan, the review, the next decision and the relevant pull request. Ask for an explanation if a green check only reports information rather than enforcing the rule you expect.

### What finishes this issue

One representative task has passed through the implemented path with independent checks and a human merge decision. Demonstrations show that missing required approval, stale evidence, self-review and out-of-scope work cannot silently advance. The runbooks accurately explain what is automated and what remains manual. No merge permission is delegated to Jev or an agent.

## Issue: Make teamwork dependable

Labels: `area:agents`, `wayfinder:task`, `kind:feature`, `needs-triage`.

### What we want and why

Make failures understandable and recoverable. If a worker stops, a tool is unavailable or reviews disagree, you should know what happened and what to do next without reconstructing the whole session.

### Where to look

Start with the halt and resume sections in `docs/runbooks/agent-team.md` and `docs/runbooks/overseer.md`, the task records in `.github/control-plane/contracts/`, and the operating limits in `docs/decisions/0003-bounded-jev-authority.md`.

### What to do next

Ask the planner to choose the most likely failures in the task path being built under **Make the team follow the control plane**. Prepare small checks for those failures before adding less common cases.

### Work included

- Stop safely when tools, authentication, model availability or usage limits prevent progress.
- Support stopping and resuming with observed worker state. A posted stop comment is not proof that a worker or GitHub job stopped.
- Prevent duplicate work when a task is delivered twice or an interrupted external action has an unknown result.
- Keep the agreed two repair rounds and one independent attempt to resolve conflicting reviews, then bring unresolved problems to the owner.
- Explain which review becomes stale after a change and what must be checked again.
- Try representative Rust work with the wallet specialist, using no real wallet keys, and record the limits of host-only or unavailable device checks.

### How to use GitHub for this issue

For each failed exercise, record what happened, what stopped, what still runs, and who must act next. Link the fix and its fresh check. The owner guide must explain both how to stop the current tools and how to confirm that they stopped; do not invent a working stop command before it exists.

### What finishes this issue

The agreed failure exercises have been run and their outcomes recorded. Recovery preserves work, permissions and required reviews. The guide provides usable next steps for stopping, resuming and resolving common blockers. Unavailable checks stay visible. The owner still decides when the overall agents phase is done.

## Issue: Help choose agents and workflows

Labels: `area:jev`, `wayfinder:task`, `kind:feature`, `needs-triage`.

### What we want and why

Use Jev to suggest who should handle a task and which process fits it. A workflow is the sequence of steps for that kind of work. For example, a Rust repair needs different expertise from a documentation update. The suggestion must not grant permission to perform the work.

### Where to look

Start with `src/selection.js`, `src/lib/registry.js`, the agent and workflow registries, `tests/unit/selection.test.js`, and `tests/live/jev-selection-cases.json`. Read `docs/decisions/0003-bounded-jev-authority.md` before changing authority.

### What to do next

After the owner moves to the Jev phase, update the candidate lists to match the working team. Ask the planner to compare the current selector with simple rules on representative requests. Establish the paid-run limit before making live calls; its amount is intentionally not decided in this roadmap.

### Work included

- Reuse the existing structured selection and useful question batching.
- Test clear, ambiguous and misleading requests, including cases with no suitable option.
- Record mistakes, delay and total cost. Do not assume another AI call saves money.
- Keep suggestions separate from permissions and deterministic policy checks.
- Ask the owner before enabling any new category of automatic action.

### How to use GitHub for this issue

Post a plain comparison of examples and results. Explain why a suggested agent fits and where Jev was uncertain. Keep paid analysis explicitly requested; opening this issue must not make a paid call. Link any proposed automation change to a separate reviewed plan.

### What finishes this issue

The owner has evidence for keeping, improving or declining Jev routing. The chosen behavior is implemented and checked, or a decision not to expand it is recorded. The documentation states whether it suggests or acts, and what happens when no suitable choice is found.

## Issue: Help agents choose useful extra skills

Labels: `area:jev`, `wayfinder:task`, `kind:feature`, `needs-triage`.

### What we want and why

Help an agent find an extra procedure when the task needs it, without making it read everything. Required skills and skills the owner explicitly asks for should not depend on Jev voting for them.

### Where to look

Use the working agent toolbox, `.skills.registry.json`, `src/selection.js`, and the [TypeSafe skill-suggestion cookbook](https://docs.typesafe.ai/cookbooks/skill_suggestion.md). The existing selector already supports no matching skill and treats skill suggestions as optional.

### What to do next

Once the real skill list is in place, ask the planner to find requests where the current selector makes an unhelpful choice. Start with those examples. Limit choices to skills already allowed for that agent.

### Work included

- Compare the current single request with a small check that the suggested skill actually helps.
- Treat no extra skill as a normal answer. Planning and explanation can still benefit from skills.
- Try a shortlist and second call only if it solves a demonstrated problem. Check the fit of the returned skill itself.
- Measure completed work, wrong or unnecessary skill loads, delay and total cost.
- Keep the suggestion from expanding the agent's tools, permissions or role.

### How to use GitHub for this issue

Show examples in everyday language: the task, the skill suggested, and whether it helped. Record a decision to keep the simple approach if an extra call adds no useful benefit. Do not describe a research result from another agent system as a proven saving for this team.

### What finishes this issue

The comparison supports a clear decision, and the chosen behavior is checked and documented. It preserves mandatory skills and permitted access. A documented decision to keep the existing selector is a valid result; extra complexity is not required.

## Issue: Help with permitted recovery choices

Labels: `area:jev`, `wayfinder:task`, `kind:feature`, `needs-triage`.

### What we want and why

Find out whether Jev helps choose among recovery steps that are already safe and allowed. For example, it might suggest asking for clarification rather than retrying a task with missing information. It must not invent permission to switch providers, expand scope or bypass review.

### Where to look

Use the failure examples and recovery procedures from **Make teamwork dependable**, the operating limits in `docs/decisions/0003-bounded-jev-authority.md`, and the shared control-plane policy code.

### What to do next

After the earlier Jev work, ask the planner to identify recovery choices that ordinary rules do not handle well. If none need AI judgment, record that result instead of adding calls.

### Work included

- List the exact recovery options already permitted for each situation.
- Compare Jev suggestions with the existing rule-based handling and human choices.
- Check uncertain answers, unavailable Jev, repeated failures and exhausted limits.
- Preserve the repair-round limits, review independence, human exceptions and stop behavior.
- Present any proposed automatic recovery category to the owner with its evidence before enabling it.

### How to use GitHub for this issue

Explain each example as a short story: what failed, what options were allowed, what was suggested and what happened. Any request for more authority must be visible as a new decision, not hidden in a code change.

### What finishes this issue

There is an evidence-backed decision about whether Jev helps. Any adopted behavior is checked against the allowed options and documented, including how it stops or asks for help. Keeping ordinary rules and human decisions is a valid outcome.

## Order and dependencies for publication

The map gives the preferred order. Do not mark whole large issues blocked merely because one later step needs another issue's output. Record those step-level needs in the relevant plan. Foundry, tool setup and control-plane design can progress together where their scoped plans permit it.

Finishing dependable-operation checks needs a working task path. Jev agent/workflow work needs the real team catalogue; skill work needs the real skill list; recovery work needs tested permitted recovery steps. Add a native blocking relationship only if that missing input prevents the next useful work on the whole issue. The owner's move to the Jev phase is a decision, not a checklist manufactured by this map.

## Shared-understanding review

The owner confirmed the shared understanding and authorized publication. Remaining technical facts belong to the work, and the spending amount is explicitly deferred. The owner then authorized pausing Jev and automated controls through small changes, with ordinary manual development in the meantime. Publish the map, large issues and necessary labels after verifying intake is disabled. Do not claim the roadmap is live until its GitHub links exist.
