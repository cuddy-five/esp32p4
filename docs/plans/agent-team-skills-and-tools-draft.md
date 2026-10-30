# Skills and tools for the agent team

Start with a small set of useful skills and tools for each agent. Reuse what we already have, adapt it to this repository, and add wallet-specific guidance where it is missing.

Status: accepted starting design. The owner accepted the recommended skills, MCP connections and file layout on 2026-10-27. These choices can be adjusted as the team is built. This document does not install tools or change any agent's access.

## Choices already made

There are seven working agents plus the Foundry. The wallet engineer combines Rust, Bitcoin and ESP32 knowledge. Each agent can be used directly or through the coordinator. Specialists can look up information themselves. The coordinator handles routine GitHub updates and keeps each review's author clear; another agent publishes directly only when the owner asks.

The owner decides when the agents phase is done. There is no new completion checklist or score for that decision. The existing rules for individual tasks still apply.

## Starting skills

A skill is a written procedure that helps an agent do a job. An MCP connection gives it tools for another service. These are different parts of its toolbox.

| Agent | Starting skills | Why these help |
| --- | --- | --- |
| Coordinator | Adapt `triage` and the existing handoff procedure | Sort incoming work, pass it to the right agent, and keep progress understandable. |
| Planner | `investigate-first`, `codebase-design`, `context-engineering` | Check the facts, map relevant repository context, reuse what exists, and prepare a clear plan. |
| Control-plane engineer | `surgical-patch` for repairs; `lean-build` for new features | Keep changes focused. Use the GitHub Actions Expert template when working on workflows. |
| Wallet engineer | Adapt `rust-patterns` and `rust-testing`; add shared wallet references | Write and test Rust for this device, using verified Bitcoin and hardware information. |
| Reviewer | Adapt `code-review`; add the relevant wallet or system guidance | Check whether the work follows the plan and repository rules. |
| Security auditor | `agent-security-hardening` for the agent system; `differential-review` for changed security behavior | Look for ways a change could expose data or let an agent act beyond its permissions. Wallet audits also need the shared wallet references. |
| Verifier | Adapt `verify-and-stop` for independent checking | Run the assigned checks and clearly report passed, failed or unavailable checks. Do not count the builder's test run as the verifier's own. |
| Foundry | Adapt `skill-creator` and the custom-agent-foundry template | Prepare agent definitions, instructions, prompts, skills and tool settings that fit together. |

Keep extra guidance available when it fits the task. Examples include `property-based-testing` for parsers and data conversion, `agentic-actions-auditor` for workflows that run AI agents, and `domain-modeling` when a term or major design choice needs explaining. Do not load the whole library for every task.

Some existing skills assume a different application, command format or kind of project. Adapt those parts instead of copying them unchanged. Keep their source and license information. Being installed for Codex does not mean a skill is already available to Copilot.

## Context engineering skill

The owner installed Awesome Copilot's `context-engineering` plugin for Copilot. This repository adapts its context-map and refactor-planning guidance in `.github/skills/context-engineering/`. The local skill is available as repository content; whether each Copilot client or delegated agent loads it must be checked in that client. Its rules require focused inspection, preserve read-only boundaries, and continue implementation when already authorized. Source and license are recorded in the skill notice.

## Starting MCP connections

| Connection | What it is for | Suggested access |
| --- | --- | --- |
| GitHub | Read issues, pull requests and check results; publish progress where authorized | Relevant reading for the team. Routine writing through the coordinator. |
| Basic Memory | Read the project's saved decisions and handoffs | Relevant project `main` notes for agents that need them. The coordinator records shared handoffs and lessons by default; other agents send it their findings. |
| Context7 | Find current documentation for software libraries | Available to agents that need library details. Check that it covers the libraries we actually use; otherwise read the official documentation directly. |
| NotebookLM | Consult the research sources the owner has collected | Relevant notebooks for each specialist. Reading and questions do not grant permission to delete sources, upload repository files or change sharing. |

Use the client's normal file, search and command tools for repository work. Engineers need editing and build/test tools. Reviewers and auditors inspect changes; the verifier needs to run tests independently. Giving an agent a command tool requires care because a command can write files even when the profile has no file-editing tool.

Start with the client's existing way to read public documentation. A separate web-search MCP can be added if that leaves a useful gap. Avoid adding another filesystem or shell MCP just to duplicate tools the client already has.

Basic Memory reading and NotebookLM listing have worked in this Codex session. That does not prove they are connected to Copilot. Context7 was checked through its documentation, not a live lookup here. No new connection has been installed or tested through a working team.

## Wallet knowledge to share

The current Rust skills contain examples meant for ordinary computers and servers. Adapt them for `no_std`, which means Rust code built without the usual operating-system library.

Keep one small shared reference set for the wallet engineer, reviewer and auditor: the exact board and camera documents, the actual Bitcoin fork and signing rules, trusted test examples, and the chosen Rust libraries. The Gemini specification is useful input, but its hardware details and security claims still need checking. This is preparation for the agents; it does not start firmware development.

## Agreed places for the files

These folders have different jobs. We can use several without creating competing copies of the rules.

| Place | What belongs there |
| --- | --- |
| `.github/agents/` | The actual agent definitions. This location is already agreed. |
| `.github/instructions/` | Shared guidance for particular files or kinds of work. |
| `.github/skills/` | The reusable procedures and references the team can use. |
| `.github/mcp.json` | Shared MCP connection setup, without secret values. Each agent gets only its selected tools. |
| `.github/prompts/` | Reusable requests for supported editors. Check terminal support before depending on it. |
| `.github/hooks/` | Small pieces of code that run at agent events, such as before a tool call. |
| `.github/workflows/` | Jobs triggered by GitHub events, including tests and reports. |
| `.github/actions/` | Reusable steps called by those GitHub jobs. |
| `.github/control-plane/` | The shared rules, record formats, settings and declared work stages. |
| `src/` | The code that reads and applies those rules. Hooks and workflows should call the same code where practical. |
| `docs/templates/` | Examples and guidance for the Foundry; not a second editable master copy of each live agent. |

Keep the rules in one place and reuse the code that checks them. For example, a hook can ask the existing control-plane code whether a proposed action is allowed. The hook should not invent a separate version of the approval rules. We still need to build and check the parts that are missing.

Copilot's documentation says delegated agents need `include-custom-instructions: true` to receive repository instructions. Directly selected agents already receive them. The Foundry should account for this difference so both ways of using the team follow the same rules. Exact per-agent skill preloading in CLI Markdown profiles remains unverified; do not assume an SDK-only setting works there.

## What informed this proposal

Read-only inspection covered the existing skill library, repository templates and Copilot CLI help. The installed CLI reported version 1.0.100-1. No worker was launched, and no new server or skill was installed or activated.

- [GitHub: create custom CLI agents](https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/create-custom-agents-for-cli) describes agent files, direct use and repository instruction inheritance.
- [GitHub: add skills](https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/add-skills) describes repository skill folders and loading relevant procedures.
- [GitHub: add MCP servers](https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/add-mcp-servers) describes built-in GitHub access and shared project configuration.
- [GitHub: hooks](https://docs.github.com/en/copilot/concepts/customizations/hooks) describes code that runs at agent events; [prompt-file guidance](https://docs.github.com/en/copilot/concepts/prompting-and-context/prompt-files) describes support in editors.
- [Context7's own documentation](https://github.com/upstash/context7) describes its library lookup and documentation tools.

These sources describe supported features. They do not prove our local setup already uses them correctly. Update this starting design when implementation reveals practical limits or the owner changes a choice.
