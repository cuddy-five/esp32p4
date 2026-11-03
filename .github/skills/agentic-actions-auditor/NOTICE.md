# Source and adaptation

Source: https://github.com/trailofbits/skills/tree/196a9073ab10d35bacf111f945e02c00b2c6883a/plugins/agentic-actions-auditor/skills/agentic-actions-auditor

License: CC-BY-SA-4.0 (Creative Commons Attribution-ShareAlike 4.0
International). Original work by Trail of Bits. See `LICENSE` in this folder.
This adapted skill is shared under the same license.

Retrieved 2026-10-25 from `trailofbits/skills` at commit
`196a9073ab10d35bacf111f945e02c00b2c6883a` into the owner's local Codex library,
and copied here on 2026-11-03. The SHA-256 of every local file matched the
recorded upstream hashes.

## Files

- `SKILL.md`: modified (changes below).
- `references/*.md` (11 files): unchanged copies.

## Changes made to SKILL.md

- Removed `allowed-tools: Read Grep Glob Bash`. In Copilot that field
  pre-approves tools.
- Replaced the Claude Code `{baseDir}/` placeholder with plain relative paths so
  the reference links resolve in this repository.
- Added an "In this repository" section. The repository's GitHub Agentic Workflow
  (`repo-status.md` compiled to `repo-status.lock.yml`) runs the Copilot CLI in
  `run:` steps, so the upstream `uses:` matching misses it. The section also notes
  that `references/action-profiles.md` has no gh-aw or Copilot CLI profile, and
  that findings are reported in the conversation.
