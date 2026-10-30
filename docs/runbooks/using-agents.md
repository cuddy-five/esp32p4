# Using this repository's agents

This guide is for trying the repository's Copilot agents in the current
owner-directed, manual mode. The agent files describe roles and tool choices;
they do not prove that every agent, model, tool, or handoff is available in
your client.

## Choose a role

There are seven working agents and one helper that prepares the team:

| Agent | Ask it to… |
| --- | --- |
| **Coordinator** (`coordinator`) | Help choose a next step, route work, and summarize what each role reports. It does not implement or review code. |
| **Planner** (`planner`) | Build or refresh codebase knowledge, verify relevant sources, and use that evidence to plan the change. It does not implement the plan. |
| **Control-plane engineer** (`implementer`) | Make owner-requested changes to repository code, tests, or documentation. |
| **Wallet engineer** (`rust-coder`) | Research or implement owner-approved Rust, Bitcoin, or ESP32 wallet work. Firmware development is not authorized by this guide. |
| **Reviewer** (`reviewer`) | Independently look for problems in a plan or change. It reports findings rather than fixing them. |
| **Security auditor** (`security-auditor`) | Look for security problems in a change or design. |
| **Verifier** (`verifier`) | Independently run assigned checks and report what passed, failed, or could not be checked. |
| **Foundry** (`custom-agent-foundry`) | Prepare or improve agent definitions, instructions, skills, and tool settings. It is a team designer, not another implementation or approval role. |

Select an agent directly when you know which one role fits a focused question or
piece of work. Ask the coordinator when you are unsure where to start, want it
to route work, or need help coordinating several roles. Keep authorship clear:
the person or agent that made a change must not be its independent reviewer or
verifier.

## Demonstrated flows

In the tested Copilot CLI session, entering `/planner` and selecting the
Planner agent was a successful direct-selection method. For example, after
selecting Planner, ask:

> Look at the request to improve the beginner documentation. Suggest a short
> plan and useful checks; do not edit files.

A coordinator-to-planner delegation was also successfully tested. Select
Coordinator and ask it to route a focused request, for example:

> Please ask the planner to outline a small plan for improving the beginner
> documentation. Return the plan and any questions for me.

Direct Planner selection and Coordinator-to-Planner delegation were
demonstrated. During creation of this guide, Coordinator delegation to the
Control-plane engineer and a separate Reviewer was also demonstrated. These
successful invocations and delegations establish only those specific flows;
they do not prove that every profile, handoff button, route, model, tool, or
agent capability works. Other useful prompts to try—not verified workflows—are:

- To the reviewer: “Inspect this change for concrete mistakes; do not edit it.”
- To the verifier: “Independently run these checks and tell me what was not
  tested.”
- To the Foundry: “Review whether this agent profile clearly describes its
  role and limits; do not change it.”

Start with a small request. Name the outcome and any important limits, such as
“read-only,” “do not publish,” or the files you want changed.

## What is and is not established

The [planner setup guide](planner-setup.md) records the first Issue #6 skill/tool
inventory, current CLI discovery evidence and the remaining live check.

Only the demonstrated flows above are established; the other agent profiles
and their capabilities remain unverified. A successful invocation or
delegation is not proof that every capability of that agent works. A model
named in a profile is not proof that the client used that model. A listed
tool or MCP connection is not proof it is configured or available. Likewise,
a skill or prompt file being present does not prove the client loaded or
supports it. Do not install tools or connections without the owner's
direction.

## Manual mode and owner decisions

Automated control-plane enforcement is paused. These profiles do not start an
automatic team workflow or enforce contract approvals. The owner directs work
and retains decisions about approvals, outside actions, commits, and every
merge. Do not enable automation or start firmware implementation as part of
trying the agents.

For a **read-only** request, agents may inspect and report, but must not make
persistent changes—including repository edits, memory entries, handoff notes,
or external posts. A role description or available tool does not grant
permission to write, publish, install, or change GitHub.

## Where to find the agent material

- `.github/agents/` — live agent profiles and their role/tool descriptions.
- `AGENTS.md` and `.github/copilot-instructions.md` — repository-wide rules;
  `.github/instructions/` — guidance for particular file types or tasks.
- `.github/skills/` — reusable project procedures. A profile mentioning a
  skill does not guarantee that the client loaded it.
- `.github/prompts/` — reusable prompt files; client support varies.
- `docs/templates/custom-agent-foundry.agent.md` — Foundry design reference.

The [manual team runbook](agent-team.md) explains the broader working
agreement and future process.

## Reviewer shell access

The reviewer has read, search and execute tools. It may inspect the local diff,
status and relevant untracked files, then return findings in chat. Follow the
read-only shell rules in `.github/agents/reviewer.agent.md`. Builds and tests
may create artifacts; leave those to the verifier unless separately authorized.

This profile does not create a read-only sandbox. Keep permission prompts enabled
and avoid blanket shell approvals. Copilot's `--deny-tool=write` does not block
shell writes. For enforced isolation, configure and verify the client sandbox's
effective filesystem and network policy, including Git metadata and writable
caches; the default workspace grant is read/write. Do not treat a setting or
profile name as proof. No client sandbox was configured by this repository edit.
See [GitHub's filesystem policy documentation](https://docs.github.com/en/copilot/concepts/security-governance-and-network-settings/understanding-local-sandboxing)
and [tool permissions](https://docs.github.com/en/copilot/how-tos/copilot-cli/use-copilot-cli/allowing-tools).
