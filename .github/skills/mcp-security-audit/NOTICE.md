# Source and adaptation

Source: https://github.com/github/awesome-copilot/tree/8178d1939a203f691067073dcab2a3f1e14072d3/skills/mcp-security-audit

License: MIT. The Awesome Copilot repository is MIT-licensed (Copyright
GitHub, Inc.); see `LICENSE` in this folder.

Retrieved 2026-11-03 from `github/awesome-copilot` at commit
`8178d1939a203f691067073dcab2a3f1e14072d3`, listed on
https://awesome-copilot.github.com/skills/.

## Files

- `SKILL.md`: upstream text plus a `license` field and an "In this repository"
  section at the end.

## Local adaptations

- "In this repository" lists where MCP servers are defined here: the shared
  `.github/mcp.json`, profile `mcp-servers` blocks, and the owner's user
  configuration.
- The user configuration is read only when the owner asks, and secret values
  are never printed.
- Findings describe static configuration, not proof of runtime behavior.
