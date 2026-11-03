# Source and adaptation

Source: the `skill-creator` system skill bundled with the owner's Codex CLI,
`~/.codex/skills/.system/skill-creator` (identical to
`~/Documents/Skills/Codex/skill-creator`), copied 2026-11-03. Its `SKILL.md` has
Git blob hash `490ccc6c3e0015eb982bb5c108c2df083be2c6c2`.

OpenAI also publishes the skill at
https://github.com/openai/skills/tree/49f948faa9258a0c61caceaf225e179651397431/skills/.system/skill-creator.
That `SKILL.md` (blob `72bc0b97e7a6476254a9d5c424c9971748402ec3`) is a different
version from the bundled one used here. Its `LICENSE.txt` (blob
`d645695673349e3947e8e5ae42332d0ac3164cd7`) is identical to the bundled one.

License: Apache-2.0 (Apache License, Version 2.0). See `LICENSE.txt` in this
folder. The root of `openai/skills` declares no license; the skill folder ships
the Apache 2.0 text, which is copied here unchanged.

## Files

- `SKILL.md`: modified (changes below).
- `LICENSE.txt`: unchanged copy of the upstream license.
- Not copied: `scripts/init_skill.py`, `scripts/quick_validate.py`,
  `scripts/generate_openai_yaml.py`, `references/openai_yaml.md`, `assets/` and
  `agents/openai.yaml`. They create and validate Codex-specific metadata. This
  repository validates skills with `npm test` instead.

## Changes made to SKILL.md

- Retargeted from Codex to GitHub Copilot: Copilot's skill frontmatter fields,
  the `.github/skills/` location, `copilot skill list`, and how Copilot CLI
  1.0.105 discovers and preloads skills (verified 2026-11-03).
- Added this repository's rules: `NOTICE.md` and `LICENSE` for adapted material,
  no `allowed-tools`, at most three preloaded skills per profile, wiring a skill
  to agents, and checking it with `npm test` and an owner-approved live run.
- Removed the Codex `agents/openai.yaml` metadata, the initializer and validator
  scripts, and the forward-testing section. That section is replaced by the live
  check in step 5.
- Shortened and reworded the remaining principles; their substance is unchanged.
