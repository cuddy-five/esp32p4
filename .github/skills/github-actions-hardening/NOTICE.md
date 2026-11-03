# Source and adaptation

Source: https://github.com/github/awesome-copilot/tree/8178d1939a203f691067073dcab2a3f1e14072d3/skills/github-actions-hardening

License: MIT. The Awesome Copilot repository is MIT-licensed (Copyright
GitHub, Inc.); see `LICENSE` in this folder.

Retrieved 2026-11-03 from `github/awesome-copilot` at commit
`8178d1939a203f691067073dcab2a3f1e14072d3`, listed on
https://awesome-copilot.github.com/skills/. The owner's personal copy in
`~/.agents/skills/github-actions-hardening` has the same text; this project copy
takes priority over it in Copilot CLI.

## Files

- `SKILL.md`: upstream text plus a `license` field and an "In this repository"
  section at the end.
- `references/*.md`: unchanged copies.

## Local adaptations

- "In this repository" explains how to change a GitHub Agentic Workflow (edit
  `repo-status.md`, then `gh aw compile repo-status`; never hand-edit the lock
  file). It points AI-agent workflows to `agentic-actions-auditor`, notes that
  actionlint runs only in CI, and leaves workflow edits to the implementer.
