# Source and adaptation

Source: https://github.com/mattpocock/skills/tree/4ae2317ddb22b046e26455e4f9c9b3aaaf62212d/skills/engineering/codebase-design

License: MIT (Copyright (c) 2026 Matt Pocock). See `LICENSE` in this folder.

Retrieved 2026-11-03 from `mattpocock/skills` at commit
`4ae2317ddb22b046e26455e4f9c9b3aaaf62212d`.

## Files

- `SKILL.md`: upstream text plus a `license` field, an "In this repository"
  section, and a reworded `DESIGN-IT-TWICE.md` link.
- `DESIGN-IT-TWICE.md`: upstream text plus one paragraph for agents that cannot
  start sub-agents.
- `DEEPENING.md`: unchanged copy.

## Local adaptations

- "In this repository" maps the vocabulary onto real seams here: the GitHub
  client and its test fake, the settings-resource module shape with its pure
  `plan(desired, actual)`, and closed contracts. It also reminds the planner
  that planning does not include implementation.
- The planner has no agent tool, so `DESIGN-IT-TWICE.md` explains how to write
  the alternative designs one at a time instead of in parallel sub-agents.
