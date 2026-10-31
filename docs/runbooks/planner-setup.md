# Planner skills and tools

This is the first slice of [issue #6](https://github.com/cuddy-five/esp32p4/issues/6).
The planner prepares a small plan from repository evidence. Its default result is
plain language in chat. JSON contracts remain available on explicit request.

## Replacement workflow (2026-10-29)

The planner profile has been rebuilt around
[acquire-codebase-knowledge](../../.github/skills/acquire-codebase-knowledge/SKILL.md).
The repository includes its entry point and all ten supporting files: seven
templates, two inquiry/stack references, and the Python scanner. The
[source notice](../../.github/skills/acquire-codebase-knowledge/NOTICE.md) pins
upstream and records the local safety adaptations.

The flow is knowledge acquisition or refresh → source verification → plan →
independent review → separate implementation. Existing `docs/codebase/` knowledge
is reused after checking relevant evidence. Missing knowledge can be built in
chat; creating or refreshing saved documents requires authorization. No populated
codebase documents or live client-loading proof are supplied by installing the skill.

The scanner uses Python's standard library; no package installation is needed.
It omits environment templates, protected filenames and symlinks. These filters
are not a general secret detector; permitted source may still contain sensitive
values. Follow the repository's secret rules during all manual reads.

The access observations below predate this replacement. Skill discovery and
selected-agent behavior for the new package remain pending. For a live check,
ask Planner to plan a small change using the new acquisition skill, cite the
knowledge and current source it used, and return the plan in chat. Record actual
skill loads and calls; do not infer them from the profile header.

## What connects to what

- [Planner profile](../../.github/agents/planner.agent.md) selects the role and intended tools.
- [Agent tools and setup](agent-tools.md) records the planner's live tool check (2026-10-30) and the GitHub launch flags it needs.
- [Planning skill](../../.github/skills/planning/SKILL.md) supplies the procedure.
- [Acquire-codebase-knowledge](../../.github/skills/acquire-codebase-knowledge/SKILL.md) supplies the knowledge foundation. Context-engineering remains available for other workflows.
- [Planning instructions](../../.github/instructions/planning.instructions.md) apply to plan artifacts.
- [Planning prompt](../../.github/prompts/plan.prompt.md) is an editor convenience, not a required CLI entry point.
- [Formal plan reference](../../.github/skills/planning/references/formal-plan-contracts.md) is loaded only for explicitly requested contracts or the formal process.

The accepted design also lists `investigate-first` and `codebase-design`. Separate
repository adaptations of those skills remain pending. Current planning covers
inspection and reuse of existing patterns; this does not claim the full upstream
skills are installed in Copilot. The context-engineering adaptation retains its
[source notice](../../.github/skills/context-engineering/NOTICE.md).

## Observed access

Checked on 2026-10-29 with Copilot CLI 1.0.105, from this checkout on base
`e8c653b` with uncommitted changes. These observations are local to that client.
Discovery is not a successful model-driven tool call.

| Capability | Purpose | Observed state | Remaining check |
| --- | --- | --- | --- |
| `planning` | Produce a scoped plan | CLI lists the repository skill as enabled | Observe it loaded and used by Planner |
| `context-engineering` | Inspect relevant files and dependencies | CLI lists the repository skill as enabled | Observe it loaded for multi-file planning |
| Repository instructions | Supply owner authority and work rules | CLI lists `AGENTS.md`, Copilot instructions and planning instructions as not disabled | Confirm relevant instructions reach the selected agent |
| Native read/search | Inspect source and existing checks | Allowed by the profile | Observe successful repository reads in the selected agent |
| Native execute/edit | Inspection, requested validation and authorized plan artifacts | Allowed by the profile; can write | Keep permission prompts; do not grant these for the read-only smoke check |
| GitHub | Read issue requirements and comments | Built-in `github-mcp-server` is listed as enabled; profile declares `github/*` | Observe an issue-read call through Planner; no publication |
| Context7 | Consult current library documentation | User server `context7` exists but is disabled | Review setup before enabling, then try a relevant lookup |
| Basic Memory | Read project decisions and handoffs | User server `basic-memory` is enabled, but Planner has no Basic Memory tool entries | Confirm exact read tools and add only needed access; shared writing stays with Coordinator |
| NotebookLM | Consult collected research | Not present in this client's server listing | Separate setup decision and a relevant read/query check |
| Native web | Read official documentation | Allowed by profile | Observe a public documentation read |
| `todo` | Track a longer plan when useful | Allowed by profile | No task-management call tested |

No `.github/mcp.json` exists in this checkout. The listing reported user and
built-in server sources, not workspace servers. No server was installed, enabled
or reconfigured for this slice. Basic Memory calls made by Codex do not establish
Planner access in Copilot.

One MCP listing emitted `Warning: timed out checking managed Browser activation;
omitting the bundled Browser.` A second listing completed without that warning.
Browser availability remains unverified. Only server names, sources, types and
enabled states were retained; connection arguments and credentials were not
printed.

## Repeat discovery without a model request

Run these from the repository root:

```fish
copilot skill list --json
copilot instruction list --json
```

`copilot` runs the client. `skill list` lists discovered skills;
`instruction list` lists instruction sources this process would load. `--json`
selects structured output. Omit it for a readable list. `copilot --version`
reports the client version. These commands do not prove skill use, agent
selection, or instruction delivery in a model session.

## Owner-run live check

This step uses the owner's Copilot model allowance. It was not run during the
local integration. Use a fresh session so earlier loaded instructions do not
mask missing integration:

```fish
copilot --agent planner --deny-tool=write --deny-tool=shell
```

`--agent planner` requests the custom agent by ID. `--deny-tool=write` denies
file-editing tools; `--deny-tool=shell` separately denies shell execution.
Keep all other permission prompts enabled. These flags do not establish a full
sandbox or prohibit all MCP side effects. Approve only reads needed below;
decline memory writes, uploads, issue edits and installations. Do not use blanket
approval flags. Do not inspect credential files.

Alternatively, start `copilot` without arguments and select Planner with `/agent`.
The earlier direct `/planner` flow was demonstrated, but a newly edited profile
still needs a fresh check. Confirm the selected agent's repository source; a
personal agent with the same ID can take precedence. A file read alone is not
selection evidence.

Give it this request:

> Planning only. Use the repository acquire-codebase-knowledge and planning skills to
> plan the next small step for issue #6, starting with Planner's tools. Inspect
> the accepted skills-and-tools draft and the current planner setup guide. Return
> the outcome, allowed files, steps, acceptance checks, remaining questions and
> next role in chat. Do not implement, write files or memory, publish, install,
> enable services, or request blanket tool approval. Distinguish client-supplied
> instructions from explicit file reads. Report actual skill loads and successful
> tool calls separately from capabilities that are only listed or unavailable.

Keep the visible agent selection and tool/skill events as evidence. An agent's
unsupported assertion that it loaded a skill or used a particular model is
insufficient. If it reads the skill explicitly, record that as explicit loading,
not automatic selection. A useful result respects scope, reports unavailable
access, and returns a practical plan without demanding JSON paperwork.

After the local read succeeds, ask for a read of issue #6 through the GitHub MCP
tool and inspect the event. A shell `gh` call or Codex read is different evidence.
Keep Context7, Basic Memory and NotebookLM checks pending until their intended
access has been set up. Repeat through Coordinator delegation only after direct
selection works; record instruction transfer separately.

This is one smoke check, not proof of reliable behavior across tasks or an
enforced read-only environment. The owner or coordinator records its results
outside the read-only Planner task. The next implementation slice should address
the first demonstrated access gap, then repeat the relevant check.

## References

- [GitHub: custom CLI agents](https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/create-custom-agents-for-cli)
- [GitHub: CLI skills](https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/add-skills)
- Local `copilot skill`, `copilot instruction`, `copilot mcp` and `copilot help permissions` help, version 1.0.105.
