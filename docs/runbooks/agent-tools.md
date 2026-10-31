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

| Agent | Skills | Tools and MCP | Live status |
| --- | --- | --- | --- |
| coordinator | planning | read, search, execute, `github/*`, agent, todo | Not tried. Basic Memory writing is planned for this role but not configured. |
| planner | acquire-codebase-knowledge, planning | read, search, edit, execute, web, `github/*`, `context7/*`, todo, six Basic Memory read tools | **Tried 2026-10-30**: Basic Memory search, Context7 library lookup, and GitHub issue read (with the launch flags below). |
| implementer | implementation, context-engineering | read, search, edit, execute, `context7/*`, todo | Not tried. |
| rust-coder | implementation | read, search, edit, execute, web, `lsp`, `github/*`, `context7/*`, todo | **Tried 2026-10-30**: `lsp` symbol search and find references through rust-analyzer. |
| reviewer | review | read, search, execute | Not tried. No MCP by design. |
| security-auditor | review | read, search, execute, `github/*`, `context7/*` | Not tried. |
| verifier | verification | read, search, execute, `github/*` | Not tried. |
| custom-agent-foundry | planning, review | read, search, edit, execute, web, agent, `github/*`, `context7/*`, todo | Not tried. |

The planner's Basic Memory tools are `search_notes`, `read_note`,
`build_context`, `recent_activity`, `read_content` and `list_directory`. The
server marks all six as read-only. Write, edit, move and delete tools are left
out on purpose, so the coordinator stays the default writer of shared notes. A
test (`tests/unit/agent-team-config.test.js`) fails if a write tool is added.

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
- **Basic Memory for the coordinator**: write access, once its role is checked.

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

## Next slices

Repeat the same path for one agent at a time: configure, check that the server
is on, run one read-only live call, and record it here. Suggested order:
reviewer, coordinator (Basic Memory writing), `lsp` for read-only agents, then
the remaining skills from the [starting design](../plans/agent-team-skills-and-tools-draft.md).
