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
| NotebookLM (`notebooklm-mcp`, notebooklm-mcp-cli 0.15.9) | User config, added 2026-11-03 with a server-level read-only tool filter | On. Signed in (`nlm login --check`). The server exposes only 9 read tools plus `server_info`; see [NotebookLM](#notebooklm). |
| Rust MCP (`rustmcp`) | Removed from this machine 2026-11-03 | 17 of its 22 tools are placeholders, and the `lsp` tool covers the rest. Replaced by the rust-analyzer language server; see [Rust code intelligence](#rust-code-intelligence). |
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

| Agent | Preloaded skills | Optional skills | Tools and MCP | Live status (2026-11-03 unless stated) |
| --- | --- | --- | --- | --- |
| coordinator | handoff | triage (the owner starts it with `/triage`; the agent cannot load it), domain-modeling | read, search, execute, `github/*`, agent, todo, six Basic Memory read tools, Basic Memory `write_note` and `edit_note` | **Tried.** `handoff` preloaded; `triage` refused to load, as designed (`disable-model-invocation: true`). Basic Memory search, `write_note` and `read_note` succeeded in a solo run; the scratch note was deleted afterwards. GitHub file read succeeded. `AGENTS.md` and `copilot-instructions.md` both loaded. |
| planner | planning, acquire-codebase-knowledge, investigate-first | codebase-design, context-engineering, domain-modeling | read, search, edit, execute, web, `lsp`, `github/*`, `context7/*`, todo, nine NotebookLM read tools, six Basic Memory read tools | **Tried.** All three preloaded; `codebase-design` loaded. NotebookLM list, Context7, `lsp` workspace symbols and GitHub succeeded. Basic Memory failed in the parallel batch (see below); it worked on 2026-10-30 and in the coordinator's solo run. |
| implementer | implementation, surgical-patch, lean-build | context-engineering, github-actions-hardening, property-based-testing | read, search, edit, execute, `context7/*`, todo | **Tried.** All three preloaded; `context-engineering` loaded; Context7 succeeded. |
| rust-coder | rust-patterns, rust-testing, device-references | implementation, property-based-testing | read, search, edit, execute, web, `lsp`, `github/*`, `context7/*`, todo, nine NotebookLM read tools | **Tried.** All three preloaded; `property-based-testing` loaded. `lsp` references (after one retry), NotebookLM list, Context7 and GitHub succeeded. A second run on its new `gpt-6-luna` pin: GitHub succeeded and the skill text was in context, but the model misquoted one skill heading (see [Models](#models)). |
| reviewer | review, code-review | test-gap-audit, device-references | read, search, execute, `lsp` | **Tried.** Both preloaded; `test-gap-audit` loaded; `lsp` references succeeded. `lsp` rename denied in both permission modes. No MCP by design. |
| security-auditor | review, differential-review | agent-security-hardening, github-actions-hardening, agentic-actions-auditor, mcp-security-audit, device-references | read, search, execute, `lsp`, `github/*`, `context7/*`, nine NotebookLM read tools | **Tried.** Both preloaded; `mcp-security-audit` loaded. `lsp`, NotebookLM list and `notebook_query`, and Context7 succeeded. GitHub `get_file_contents` failed twice with `MCP error -32020: header mismatch: missing Mcp-Param-owner header`, while the same call succeeded for four agents in the same batch. A second run, with identical arguments on the same model, succeeded on the first try, so the failure looks transient. |
| verifier | verification, verify-and-stop | test-gap-audit | read, search, execute, `github/*` | **Tried.** Both preloaded; `test-gap-audit` loaded; GitHub succeeded. |
| custom-agent-foundry | skill-creator | planning, review | read, search, edit, execute, web, agent, `github/*`, `context7/*`, todo | **Tried.** `skill-creator` preloaded; `planning` loaded; Context7 and GitHub succeeded. It ran on the session model because its old pin was unavailable (see [Models](#models)). |

The planner's Basic Memory tools are `search_notes`, `read_note`,
`build_context`, `recent_activity`, `read_content` and `list_directory`. The
server marks all six as read-only. The coordinator has the same six plus
`write_note` and `edit_note`, so it is the only agent that writes shared notes.
No agent has `delete_note`, `move_note` or the project tools. A test
(`tests/unit/agent-team-config.test.js`) fails if any other agent gets a write
tool or if anyone gets a delete, move or project tool.

**CI gate.** `node src/cli.js policy check`, part of CI's `test` job, reads every
profile and fails unless it is mapped to a role in
`.github/control-plane/policies/tool-access.yaml`, lists only tools that role
allows (a missing `tools` list fails, since Copilot then grants every tool), and
pins one model ID. Review roles must also set `modelPolicy: required`
and use a different model family from the coding agents. The gate checks
declarations; the client still decides what an agent can actually do.

### Models

Every profile pins one model ID. ADR 0003 requires security-critical review
from a different model family than the author's, so the two coding agents
share OpenAI's `gpt-6-luna` and every review role uses another family. The
[CI gate](#agents) checks that each review role declares a family the coding
agents do not use; the shared `gpt-6-luna` pin itself is a convention.

| Agent | Pinned model | Family | `modelPolicy` | Model that ran (2026-11-03) |
| --- | --- | --- | --- | --- |
| coordinator | `gpt-5.6-luna` | OpenAI | none | `gpt-5.6-luna` |
| planner | `gpt-5.6-luna` | OpenAI | none | `gpt-5.6-luna` |
| implementer | `gpt-6-luna` | OpenAI | none | `gpt-6-luna` |
| rust-coder | `gpt-6-luna` (no pin before) | OpenAI | none | `gpt-6-luna` after the pin; the session model, `claude-sonnet-5.5`, before it |
| reviewer | `kimi-k3` | Moonshot AI | `required` | `kimi-k3` |
| security-auditor | `claude-sonnet-5.5` (`claude-sonnet-4.6` before) | Anthropic | `required` | `claude-sonnet-5.5`; with the old pin, the same model as the session fallback |
| verifier | `claude-haiku-4.5` | Anthropic | `required` | `claude-haiku-4.5` |
| custom-agent-foundry | `claude-sonnet-5.5` (`claude-sonnet-4.6` before) | Anthropic | none | `claude-sonnet-5.5`, as the session fallback for the old pin; not run again |

**What was wrong.** GitHub retired Claude Sonnet 4.6 from Copilot on 2026-09-01
for most plans ([changelog](https://github.blog/changelog/2026-08-31-selected-github-copilot-models-deprecated)).
Copilot then runs the agent on the session model and only writes
`Warning: Custom agent "…" specifies model "…" which is not available; using "…" instead`
to stderr. rust-coder had no pin at all, so a security audit of its signing code
ran on the model that wrote it.

**`modelPolicy: required`** (camelCase, as the CLI reference spells it) makes
Copilot refuse to dispatch the agent instead of falling back: "dispatch is
refused rather than silently substituting an unauthored model". The review
roles set it. This is documented, not live-checked. The 1.0.83 changelog's
spelling, `model-policy`, did nothing in a probe: the agent still fell back.
With the session model set to `Auto`, subagents always run on the resolved
session model whatever their pin (CLI reference), so do not use `Auto` for
security-critical review. After a run that matters, check stderr for `which is not available`, or the
`model.call_start` events in `--output-format json` output. The `/model` picker
shows which models the account has.

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
marked verified or unverified, with its source. State on 2026-11-03:

- **Fork rules: reviewed.** `doc/unified-sighash.md` at Knots
  `v29.4.3.knots20260508` (commit `a7c4617`) was read in full and compared with
  `SignatureHashUnified`. A separate implementation written from the document
  alone, `device-references/scripts/unified_sighash_check.py`, reproduces all
  166 Knots test vectors. BLAKE2b turned out to be used only for block-header
  proof of work, so a signer does not need it. The BIP-110 (RDTS) limits also
  apply from the fork height; they are located but not reviewed.
- **Board schematic: traced visually.** The ESP32-C6 is enabled by P4 GPIO54
  through R54, with a 10 kΩ pull-up that turns the C6 on whenever GPIO54 is not
  driven low. It runs from `ESP_3V3`, the AXP2101 DCDC1 output that also feeds
  the P4. So the historical plan of cutting the C6's power through the AXP2101
  does not work on this board.
- **Chip: datasheet v0.7 read.** It confirms the 32 MB PSRAM variant, chip
  revision v3.x, the internal memory sizes, the RNG's entropy sources and
  power modes. The Key Manager hardware exists, but ESP-IDF does not support it
  yet. ESP-IDF's eFuse table and programming guide cover JTAG disabling,
  download mode and when the RNG is truly random.
- **Chip: Technical Reference Manual v0.7 read** for memory, access and power.
  The LP core and DMA masters, USB included, can reach L2MEM and PSRAM unless
  the APM permission unit is set up, and LP SRAM stays powered in every sleep
  mode. The manual's peripheral table has wrong addresses, so code takes them
  from ESP-IDF or the Rust PAC.
- **Owner decisions (2026-11-03).** The device signs only with the unified
  sighash. The ESP32-C6 is to be removed from the board, or its antenna feed.
  Whether to enforce the RDTS limits is deferred to
  [#21](https://github.com/cuddy-five/esp32p4/issues/21).

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
default agent has it automatically. `rust-coder`, `planner`, `reviewer` and
`security-auditor` list it. rust-coder's profile tells it to make edits with the
edit tool, not with `lsp` rename; the other three profiles forbid rename, and a
test checks that.

**How `lsp` rename is controlled.** Live-checked on 2026-11-03 (see the
[live check record](#live-check-record)): Copilot treats an `lsp` rename as a
file write. With `--deny-tool write` it returns `Permission denied by rules:
write(*)`. In an unattended `-p` run with no allow rule it returns `Permission
denied because no interactive user response was available`. In an interactive
session it asks you first, as it does for any edit. The navigation operations
(`findReferences`, `workspaceSymbol`, definitions, hover) need no permission. So
adding `lsp` gives a read-only agent no new way to write files without your
approval. Its `execute` tool already could, which is why the read-only recipe
below also denies `shell`.

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
of `dexwritescode/rust-mcp`, and the owner decided against it on 2026-11-03:

- 17 of its 22 tools are placeholders. For example, `run_cargo_check` and
  `apply_clippy_suggestions` return success text without running anything.
  An agent could report a check that never happened.
- The 5 real tools pass rust-analyzer requests through and return the raw
  response. The `lsp` tool covers the same navigation.
- It failed to start under Copilot 1.0.105. **Correction (2026-11-03):** the
  cause is two `println!` banners ("Starting Rust MCP Server", "Server running
  on stdio transport...") that it writes to stdout before the JSON-RPC stream,
  not the order of the handshake messages, as this page said before. A manual
  `initialize` and `tools/list` exchange worked once those two lines were
  skipped. Copilot's "waiting for discover response" error and rustmcp's
  `connection closed` exit were symptoms of that.

### NotebookLM

Done on 2026-11-03. The owner's Google sign-in was already valid
(`nlm login --check` reported "Authentication valid!"). The server was added to
the Copilot user config with a tool filter, so it exposes only read tools to
every agent:

```fish
copilot mcp add notebooklm \
    --tools "notebook_list,notebook_get,notebook_describe,source_describe,source_get_content,notebook_query,notebook_query_start,notebook_query_status,cross_notebook_query,server_info" \
    -- /home/cb/.local/bin/notebooklm-mcp
```

`copilot mcp add <name> -- <command>` registers a local (stdio) server in
`~/.copilot/mcp-config.json`; everything after `--` is the command Copilot
starts. `--tools` is a server-level filter: Copilot offers only the named tools,
whatever an agent's profile lists. The default, `"*"`, would expose all 55
tools, including `notebook_delete`, `source_delete`, `source_add`,
`notebook_share_public` and `notebook_share_invite`. Two alternatives:

- `--tools ""` keeps the server configured but exposes nothing, a quick way to
  turn it off for agents without removing it.
- Leaving the filter at `"*"` and listing tools per agent puts every write tool
  one profile typo away, because Copilot ignores unknown names silently.

To check, run `copilot mcp get notebooklm`; success shows `Status: Enabled` and
the ten tool names. `copilot mcp remove notebooklm` undoes it. If a call reports
expired auth, run `nlm login` again yourself; never paste cookies into a chat.

The server reports no read-only or destructive hints for any tool, so the list
was chosen by hand. `notebook_query` and `cross_notebook_query` ask NotebookLM's
AI and may add to the notebook's chat history; they change no sources, notes
or sharing.

**Who reads which notebooks.** The planner, rust-coder and security-auditor
have the nine read tools (not `server_info`). Each profile names the notebooks
it may read: `ESP32 P4 Repo`, `Agentic Engineering` and `GitHub Agentic
Certification` for the planner; `ESP32 P4 Repo`, `Rust no_std Bare-Metal
Firmware & Bitcoin Hardware Wallet Guide` and `SeedSigner` for the other two.
**The tools cannot enforce that:** `notebook_list` shows all of the owner's
notebooks, and any read tool can read any of them. The rule is in the profile
text only. Notebook answers are secondary sources and never count as evidence
for `device-references`. A test fails if any other agent gets a NotebookLM tool
or if anyone gets a tool outside the read list.

### Still open

Nothing open is left in the agents' tools. The remaining firmware items moved
to [#21](https://github.com/cuddy-five/esp32p4/issues/21) on 2026-11-03:

- whether the device enforces the RDTS limits (the owner deferred it);
- removing the ESP32-C6 from a real board, and checking the board afterwards;
- measuring the board, since the radio findings come from the schematic only;
- chip details not read yet: setting up PMP and APM, the LP TRNG block in
  ESP-IDF's v3 register map, and whether LP SRAM keeps its contents on
  `VDD_BAT` alone.

Known limits that stay:

- Starting several Copilot sessions at once breaks Basic Memory's handshake
  (see the live check record). Start them one at a time.
- `modelPolicy: required` should stop a review from running on another model,
  but that is not live-checked. Check which model ran (see [Models](#models)).

`poppler-utils` is installed in `devbox` (2026-11-03): `pdftotext -layout <file> -`
reads the vendor PDFs.

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

**2026-11-03, every agent.** Eleven runs (plus two instruction checks), about
$0.71 in AI credits in total. Each per-agent run was
`--no-ask-user --output-format json --deny-tool write --deny-tool shell`, plus
`--allow-tool <server>` for that agent's MCP servers and the GitHub read tools
from [GitHub read tools](#github-read-tools). The prompt asked the agent to quote
its preloaded skills' first lines without calling a tool, load one optional
skill, and make one read call per server. A temporary crate gave rust-analyzer
something to index and was deleted afterwards. Results are in the table under
[Agents](#agents). Findings:

- **`lsp` rename is a write.** Reviewer, asked to rename (owner-authorized
  test): with `--deny-tool write`, `Permission denied by rules: write(*)`;
  without it, in an unattended run, `Permission denied because no interactive
  user response was available`. The file was unchanged both times.
- **Do not start several Copilot sessions at once with Basic Memory.** Eight
  parallel runs made the Basic Memory server fail with `-32022: connection is
  serving the 2026-07-28 protocol; the initialize handshake is not accepted`.
  Copilot first probes with the newer protocol's `server/discover`. The
  server's `mcp` 2.3.0 library locks the connection to that protocol, so when
  a slow start makes Copilot fall back to `initialize`, the server refuses it.
  Firecrawl timed out in the same batch. A single run worked.
- **Instruction loading works.** Without tools, the coordinator quoted
  `AGENTS.md`'s heading, and found the opening sentence of
  `.github/copilot-instructions.md`. With `--no-custom-instructions` it found
  neither.
- **`skills:` preloading holds for every agent**: each quoted its preloaded
  skills' first lines without a tool call.
- **Two agents ran on the wrong model.** The stderr files of the security-auditor
  and custom-agent-foundry runs held the `which is not available` warning; this
  record missed it at first. See [Models](#models).

**2026-11-03, model pins.** Three runs after the profile changes in
[Models](#models), about $0.12 in AI credits. Same flags as above; the
`get_file_contents` runs added the GitHub read tools.

| Run | Result |
| --- | --- |
| security-auditor, `claude-sonnet-5.5` with `model-policy: required` | Ran on `claude-sonnet-5.5`, no warning. Quoted both preloaded skills' headings exactly. `get_file_contents` succeeded on the first try, with the arguments and model that failed twice in the batch above. $0.098. |
| rust-coder, `gpt-6-luna` | Ran on `gpt-6-luna`, no warning. `get_file_contents` succeeded. It quoted `# device-references` for the real heading `# Device references`. The other two headings equal their skill names, so the quotes prove little. $0.0035. |
| Probe: a temporary profile with `model: claude-sonnet-4.6` and `model-policy: required` | Printed the warning and ran on `claude-sonnet-5.5`. The kebab-case key had no effect; the documented key is `modelPolicy`. The profile was deleted afterwards. $0.022. |

The rust-coder's skill text was in context despite the misquote: the
`selected_agent_instructions` entry under `system_segments` in
`session.usage_checkpoint` had the size of the profile plus its three skills.

## Next slices

1. The firmware items in [#21](https://github.com/cuddy-five/esp32p4/issues/21).
2. Re-run the per-agent live check after any profile, skill, model or MCP
   change, with the recipe above, and treat a `which is not available` warning
   on stderr as a failure.
