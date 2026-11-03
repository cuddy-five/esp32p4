# Source and adaptation

Source: https://github.com/trailofbits/skills/tree/196a9073ab10d35bacf111f945e02c00b2c6883a/plugins/differential-review/skills/differential-review

License: CC-BY-SA-4.0 (Creative Commons Attribution-ShareAlike 4.0
International). Original work by Trail of Bits. See `LICENSE` in this folder.
This adapted skill is shared under the same license.

Retrieved 2026-10-25 from `trailofbits/skills` at commit
`196a9073ab10d35bacf111f945e02c00b2c6883a` into the owner's local Codex library,
and copied here on 2026-11-03. The SHA-256 of every local file matched the
recorded upstream hashes.

## Files

- `SKILL.md`: modified (changes below).
- `methodology.md`, `adversarial.md`, `reporting.md`, `patterns.md`: unchanged
  copies.

## Changes made to SKILL.md

- Removed `allowed-tools: Read Write Grep Glob Bash`. In Copilot that field
  pre-approves tools, and the security auditor must keep its permission prompts.
- Added an "In this repository" section: read-only Git commands, the report goes
  in the conversation unless the owner names a file, `.review-domains.json`
  checklists, related skills, and model-family diversity.
- Changed the "Output-Driven" principle, the "I'll explain verbally" row, the
  quality checklist and the tips so that a written report no longer has to be a
  file.
- Removed the "Agents" section and the decision-tree pointer to
  `differential-review:adversarial-modeler`. That agent is not part of this
  repository.
- Removed the "Integration" section, which names `audit-context-building` and
  `issue-writer`, two skills that are not part of this repository. The deep audit
  example no longer names `audit-context-building`.
- Changed "generates a markdown report" to "writes a markdown report" in the
  description.
