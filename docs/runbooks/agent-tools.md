# Agent tools and setup

This page records which skills and tools each agent has, what they are for,
and whether the access was actually tried. It is the tool table for
[issue #6](https://github.com/cuddy-five/esp32p4/issues/6). Client: GitHub
Copilot CLI 1.0.105.

A tool name in a profile proves nothing. Copilot ignores unrecognized tool
names without an error, so a server that is missing or disabled simply
disappears from the agent. Only a live call shows that access works.

Status words:

- **Configured**: the profile lists it.
- **Server on**: `copilot mcp list` shows the server enabled.
- **Tried**: a live call from that agent succeeded. The date says when.

## MCP servers

| Server | Where it is set up | Status |
| --- | --- | --- |
| GitHub (`github-mcp-server`, built in) | Copilot CLI | On. Read-only. The default tool set cannot read issues or pull requests; see [GitHub read tools](#github-read-tools). |
| Context7 | User config (`~/.copilot/mcp-config.json`) | On since 2026-10-30. It was disabled before, so every `context7/*` entry was silently ignored. |
| Basic Memory | User config | On. Personal knowledge base; project `main`. |
| Firecrawl | User config | On. No agent lists it. |
| NotebookLM | Not set up for Copilot | `notebooklm-mcp` is installed locally but not configured. |
| Rust MCP (`rustmcp`) | Not used | Fails Copilot's startup handshake, and 17 of its 22 tools are placeholders. Replaced by the rust-analyzer language server; see [Rust code intelligence](#rust-code-intelligence). |
| `.github/mcp.json` | Does not exist yet | Shared project servers go here, without secret values. None is needed yet. |

## Language servers

| Server | Where it is set up | Status |
| --- | --- | --- |
| rust-analyzer | Project config (`.github/lsp.json`) | On for `.rs` files. Copilot starts it in the background in trusted folders. Agents reach it through the built-in `lsp` tool. |

## Agents

"Preloaded" skills are listed in the profile's `skills:` and load in full on
every run. "Optional" skills are named in the profile's **Skills** line; the
agent loads them with the `skill` tool when the task fits. See
[Skills](#skills) for how this works.

| Agent | Preloaded skills | Optional skills | Tools and MCP | Live status |
| --- | --- | --- | --- | --- |
| coordinator | handoff | triage (the owner starts it with `/triage`), domain-modeling | read, search, execute, `github/*`, agent, todo, six Basic Memory read tools, Basic Memory `write_note` and `edit_note` | Not tried. Basic Memory writing configured 2026-11-03; the owner deferred the live check. |
| planner | planning, acquire-codebase-knowledge, investigate-first | codebase-design, context-engineering, domain-modeling | read, search, edit, execute, web, `github/*`, `context7/*`, todo, six Basic Memory read tools | **Tried 2026-10-30**: Basic Memory search, Context7 library lookup, GitHub issue read (with the launch flags below). **Tried 2026-11-03**: preloading of `planning` and `acquire-codebase-knowledge`, before `investigate-first` was added. |
| implementer | implementation, surgical-patch, lean-build | context-engineering, github-actions-hardening, property-based-testing | read, search, edit, execute, `context7/*`, todo | Not tried. |
| rust-coder | rust-patterns, rust-testing, device-references | implementation, property-based-testing | read, search, edit, execute, web, `lsp`, `github/*`, `context7/*`, todo | **Tried 2026-10-30**: `lsp` symbol search and find references through rust-analyzer. Skills not tried. |
| reviewer | review, code-review | test-gap-audit, device-references | read, search, execute | **Tried 2026-11-03**: exact tool list, and loading a skill through the `skill` tool, before its `skills:` list was added. No MCP by design. |
| security-auditor | review, differential-review | agent-security-hardening, github-actions-hardening, agentic-actions-auditor, mcp-security-audit, device-references | read, search, execute, `github/*`, `context7/*` | Not tried. |
| verifier | verification, verify-and-stop | test-gap-audit | read, search, execute, `github/*` | Not tried. |
| custom-agent-foundry | skill-creator | planning, review | read, search, edit, execute, web, agent, `github/*`, `context7/*`, todo | Not tried. |

The planner's Basic Memory tools are `search_notes`, `read_note`,
`build_context`, `recent_activity`, `read_content` and `list_directory`. The
server marks all six as read-only. The coordinator has the same six plus
`write_note` and `edit_note`, so it is the only agent that writes shared notes.
No agent has `delete_note`, `move_note` or the project tools. A test
(`tests/unit/agent-team-config.test.js`) fails if any other agent gets a write
tool or if anyone gets a delete, move or project tool.

## Skills

Skills live in `.github/skills/<name>/SKILL.md`. A skill is written guidance:
it never adds a tool, and the profile's `tools` list still decides what an
agent can do.

### How Copilot CLI loads skills

Verified with Copilot CLI 1.0.105 on 2026-11-03 (see the
[live check record](#live-check-record)):

- **Every agent sees every enabled skill's name and description.** That
  includes project skills, personal skills (`~/.copilot/skills`,
  `~/.agents/skills`), plugin skills and built-in skills. There is no
  per-agent filter.
- **`skills:` preloads full skill text.** The CLI's command reference does not
  list `skills` as a custom-agent field, but the CLI honors it. VS Code's
  custom-agent reference documents it as "Names of skills to load into the
  agent's context in Copilot".
- **Every custom agent has the `skill` tool**, even with an explicit `tools`
  list, and uses it to load any other skill on demand. It also gets a `sql`
  tool.
- **`allowed-tools` in a skill pre-approves tools** while that skill is active.
  No project skill may set it; a test checks this.

So each profile preloads one to three core skills (a test enforces the limit),
names its optional skills in its **Skills** line, and tells the agent to leave
other roles' skills alone. Each skill's description says when it applies.

Your own personal and plugin skills also reach every agent in this repository:
`agent-architecture`, `context-map`, `refactor-plan`, `what-context-needed` and
`rust-mcp-server-generator`, plus the built-in `customize-cloud-agent` and
`github-pr-media`. The project's `github-actions-hardening` takes priority over
your personal copy with the same name. `copilot skill list` shows what is
enabled. `copilot skill disable <name>` turns a skill off without deleting it,
and `copilot skill enable <name>` turns it back on. Both change your setup for
every project, not just this one.

### Sources and licenses

| Skills | Source | License |
| --- | --- | --- |
| handoff, triage, codebase-design, code-review, domain-modeling | [mattpocock/skills](https://github.com/mattpocock/skills) at `4ae2317` | MIT |
| differential-review, property-based-testing, agentic-actions-auditor | [trailofbits/skills](https://github.com/trailofbits/skills) at `196a907` | CC-BY-SA-4.0; the adaptations are shared alike |
| github-actions-hardening, test-gap-audit, mcp-security-audit | [github/awesome-copilot](https://github.com/github/awesome-copilot) at `8178d19`, listed on [awesome-copilot.github.com/skills](https://awesome-copilot.github.com/skills/) | MIT |
| acquire-codebase-knowledge, context-engineering | github/awesome-copilot (earlier versions) | MIT |
| agent-security-hardening, rust-patterns, rust-testing | [affaan-m/ECC](https://github.com/affaan-m/ECC) at `b38be6a` | MIT |
| skill-creator | The Codex CLI's bundled `skill-creator` (OpenAI) | Apache-2.0 |
| investigate-first, surgical-patch, lean-build, verify-and-stop | The owner's local Codex skill library; no upstream recorded | This repository's license |
| planning, implementation, review, verification, device-references | Written for this repository | This repository's license |

Each adapted folder has a `NOTICE.md` (source, commit, every change) and the
upstream license text, and its `SKILL.md` has a `license` field. A test checks
all three. Not copied: the `coverage_map.py` script from `test-gap-audit`, which
reads files without this repository's secret-file exclusions, and
`skill-creator`'s Codex-only scripts and metadata.

### Device references

`device-references` is the shared fact sheet for the wallet engineer, reviewer
and security auditor: the ESP32-P4 chip, the candidate Waveshare board, the
Bitcoin standards with their test vectors, and the intended fork. Every fact is
marked verified or unverified, with its source. Open items:

- The ESP32-P4 datasheet is downloaded but unread: no PDF text tool is installed.
- The board schematic is unread, so the radio-isolation method is unverified.
- The fork's rules come from Bitcoin Knots `v29.4.3.knots20260508` (commit
  `a7c4617`): `doc/unified-sighash.md` (a draft; no BIP exists) and the source.
  They are located and pinned but not yet reviewed for the device.

The skill folder is not called `wallet-references` because a local Claude Code
hook blocks writes to any path containing "wallet", to protect wallet files.

## Setup guide

### Context7

Done on 2026-10-30 with `copilot mcp enable context7`. To check, run
`copilot mcp list`; success looks like `context7 (http)` without `disabled`.
`copilot mcp disable context7` turns it off again.

### GitHub read tools

The built-in GitHub server gives Copilot CLI a small default tool set:
file contents, code search, user search and Copilot Spaces. It has no tool for
reading issues or pull requests, so a planner asked about an issue fails.
No setting makes extra GitHub tools persistent. Add them when starting
Copilot:

```fish
function copilot-team --description 'Copilot CLI with read-only GitHub issue and PR tools'
    copilot \
        --add-github-mcp-tool get_file_contents --add-github-mcp-tool search_code \
        --add-github-mcp-tool issue_read --add-github-mcp-tool list_issues \
        --add-github-mcp-tool search_issues \
        --add-github-mcp-tool pull_request_read --add-github-mcp-tool list_pull_requests \
        $argv
end
funcsave copilot-team
```

`--add-github-mcp-tool <tool>` enables one GitHub MCP tool. It **replaces**
the default set instead of adding to it, so the function lists the useful
defaults (`get_file_contents`, `search_code`) again. `$argv` passes on any
other arguments, such as `--agent planner`. `funcsave` stores the function
in `~/.config/fish/functions/` so it survives new shells. Two alternatives:

- `--add-github-mcp-toolset issues` adds a whole toolset. Toolsets can include
  write tools such as creating issues or comments, which every agent with
  `github/*` would then receive.
- `--enable-all-github-mcp-tools` enables everything, including write tools.
  Use it only for a deliberate one-off task.

Every tool above only reads. Writing to GitHub stays with the owner or, later,
the coordinator.

### Rust code intelligence

`.github/lsp.json` defines rust-analyzer as the project language server.
Copilot's built-in `lsp` tool then offers go to definition, find references,
hover, document and workspace symbols, implementations, call hierarchy and
rename. To check the configuration, run `copilot lsp list`; in an interactive
session, `/lsp test rust-analyzer` starts and tests the server.

A custom agent gets the tool only when its `tools` list names `lsp`. The
default agent has it automatically. Only `rust-coder` lists it so far, and its
profile tells it to make edits with the edit tool, not with `lsp` rename.

The configuration turns off three rust-analyzer defaults:

```json
"initializationOptions": {
  "cargo": { "buildScripts": { "enable": false } },
  "procMacro": { "enable": false },
  "checkOnSave": false
}
```

- `cargo.buildScripts.enable: false`: does not run dependency `build.rs`
  scripts when indexing.
- `procMacro.enable: false`: does not run procedural macros when indexing.
- `checkOnSave: false`: does not run `cargo check` in the background.

With the defaults, opening a Copilot session in this folder would run
dependency code with no permission prompt. That matters for a wallet
repository. The cost is weaker analysis of code that comes from macros or
build scripts, which ESP32 HAL crates use heavily. Turn the two indexing
settings back on only after the dependency set is reviewed. rust-analyzer
still runs `cargo metadata`, which can create or update `Cargo.lock` and
fetch the crate index.

**Why not `rustmcp`.** It was checked on 2026-10-30, at local commit `f03b2b0`
of `dexwritescode/rust-mcp`:

- Copilot 1.0.105 failed to start it, logging `MCP server process exited
  before completing the MCP initialize handshake` while it waited for a
  `discover response`. rustmcp (built on rmcp 0.2.1) exits with the same
  error whenever its first message is not `initialize`.
- 17 of its 22 tools are placeholders. For example, `run_cargo_check` and
  `apply_clippy_suggestions` return success text without running anything.
  An agent could report a check that never happened.
- The 5 real tools pass rust-analyzer requests through. The `lsp` tool
  covers the same navigation and rename, and `cargo fmt` covers formatting.

### Not set up yet

- **`lsp` for other agents**: the planner, reviewer and security-auditor could
  use it for read-only navigation. Its rename operation writes files, so check
  how it interacts with each agent's permissions before adding it.
- **NotebookLM**: needs the owner's Google sign-in (`nlm login`) and a decision
  on which notebooks each specialist may read. Reading must not include deleting
  sources, uploading files or changing sharing.
- **A live check of every agent with its new skills and tools**: deferred by the
  owner on 2026-11-03. Each `copilot -p` run costs one premium request, so a
  pass over all eight agents costs about eight. The recipe is under
  [Live check record](#live-check-record). The coordinator's Basic Memory
  writing is configured but has never been tried live.

## Live check record

**2026-10-30, planner.** Run without shell or file-write permission:

```fish
copilot --agent planner --no-ask-user --output-format json \
    --allow-tool basic-memory --allow-tool context7 --allow-tool github-mcp-server \
    --deny-tool write --deny-tool shell \
    -p '<read-only tool check prompt>'
```

`--agent` selects the profile. `--no-ask-user` keeps the run unattended.
`--output-format json` prints one event per line, including every tool call.
`--allow-tool <server>` pre-approves all tools of one MCP server.
`--deny-tool write` and `--deny-tool shell` block file writes and commands;
denials win over every allow rule.

| Step | Tool called | Result |
| --- | --- | --- |
| List visible tools | none | Six Basic Memory read tools, two Context7 tools, five default GitHub tools. No Basic Memory write tool was visible. |
| Search project notes | `basic-memory-search_notes` | Success. |
| Look up library docs | `context7-resolve-library-id` | Success: `/ajv-validator/ajv`. |
| Read issue #6 | `github-mcp-server-get_file_contents` | Failure: the default GitHub tool set has no issue tool. |
| Read issue #6 again, with `--add-github-mcp-tool issue_read` and the other read tools | `github-mcp-server-issue_read` | Success: "Give agents their skills and tools". |

**2026-10-30, rust-coder.** Same flags without the MCP allows. A temporary
crate, `lsp-probe/`, gave rust-analyzer something to index and was deleted
afterwards. Copilot starts language servers only in trusted folders, so a run
in a scratch folder outside `~` showed no `lsp` tool.

| Step | Tool called | Result |
| --- | --- | --- |
| Profile with `rust-mcp` in `mcp-servers` | none | Failure: the server exited during Copilot's handshake. |
| Profile with `.github/lsp.json` but no `lsp` in `tools` | none | Failure: no `lsp` tool visible. The default agent did have it. |
| List visible tools, `lsp` added | none | `lsp` visible, alongside the usual built-in, GitHub and Context7 tools. |
| Search symbols for `next_index` | `lsp` `workspaceSymbol` | First call found nothing while indexing; the retry found it at `lib.rs:3:8`. |
| Find references | `lsp` `findReferences` | First call failed with `content modified`; the retry found all 3. |

**2026-11-03, skills.** Three runs, each with `--no-ask-user --output-format json
--deny-tool write --deny-tool shell`, before the skill changes in this
repository. Each cost one premium request.

The JSON output's `session.usage_checkpoint` event holds the exact tool list
sent to the model, under `promptCacheBreakState[].models[<model>].tools[].name`.
That is better evidence than asking the model to list its tools.
`session.skills_loaded` lists every skill the session discovered.

| Agent | Prompt | Result |
| --- | --- | --- |
| reviewer (`tools: ['read', 'search', 'execute']`, no `skills:`) | List your tools; load the `verification` skill with the skill tool and quote its first heading | Tool list sent to `kimi-k3`: view, grep, glob, bash, read_bash, stop_bash, list_bash, skill, sql. The `skill` call returned "Skill \"verification\" loaded successfully" and the agent quoted the right heading. The session discovered 16 skills: 8 project, 2 personal, 4 plugin, 2 built-in. |
| planner (`skills: [acquire-codebase-knowledge, planning]`) | Without calling a tool, quote the first heading of `planning` and `acquire-codebase-knowledge` if their full text is in context | No tool call; both exact headings quoted: preloaded. |
| planner, control | The same for `verification`, `review` and `planning` | `verification` and `review`: description only. `planning`: heading quoted. |

## Next slices

1. When the owner agrees to the cost, run one read-only live check per agent:
   confirm the preloaded skill headings, load one optional skill, and record
   the tool list from `session.usage_checkpoint`.
2. `lsp` for read-only agents, after checking how rename interacts with each
   agent's permissions.
3. NotebookLM, after the owner's sign-in and a decision on which notebooks each
   specialist may read.
4. The device references' open items: the datasheet, the board schematic, and
   a full review of the fork's unified-sighash and BLAKE2b rules.
