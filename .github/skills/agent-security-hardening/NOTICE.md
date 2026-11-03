# Source and adaptation

Source: https://github.com/affaan-m/ECC/blob/b38be6a7f6350964d59328b52f0624e1d1d552d1/skills/agent-security-hardening/SKILL.md

Copied on 2026-11-03 from the owner's local ECC (Everything Claude Code)
checkout, `~/.local/share/ecc-custom/upstream/skills/agent-security-hardening`.
Its Git blob hash, `726cd3e2e01e7b03103c98639585868dd3afc392`, matches the file at
`affaan-m/ECC` commit `b38be6a7f6350964d59328b52f0624e1d1d552d1`.

License: MIT (Copyright (c) 2026 Affaan Mustafa). See `LICENSE` in this folder.

## Files

- `SKILL.md`: upstream text through "Common Issues", plus a `license` field and
  rewritten closing sections.

## Local adaptations

- Added "In this repository": a table of this agent system's boundaries (agent
  tools, the role tool policy, skills, MCP servers, hooks, CI agents) and what
  actually enforces each one today.
- Rewrote "When NOT to Use" and "Related Skills" to name skills that exist here
  (`differential-review`, `github-actions-hardening`, `agentic-actions-auditor`,
  `mcp-security-audit`). The upstream names `security-review`, `security-scan`
  and `agent-harness-construction` are not part of this repository.
- The Python examples are unchanged. They illustrate controls; they are not code
  from this repository.
