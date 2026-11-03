# Source and adaptation

Source: https://github.com/mattpocock/skills/tree/4ae2317ddb22b046e26455e4f9c9b3aaaf62212d/skills/engineering/domain-modeling

License: MIT (Copyright (c) 2026 Matt Pocock). See `LICENSE` in this folder.

Retrieved 2026-11-03 from `mattpocock/skills` at commit
`4ae2317ddb22b046e26455e4f9c9b3aaaf62212d`.

## Files

- `SKILL.md`: upstream text with a `license` field and a rewritten "File
  structure" section.
- `ADR-FORMAT.md`: upstream text, with the record location and numbering
  changed to `docs/decisions/`.
- `GLOSSARY-FORMAT.md`: unchanged copy.

## Local adaptations

- Decision records live in `docs/decisions/`, following
  `docs/agents/domain.md`. No `docs/adr/` folder is created.
- New records follow the existing `# ADR NNNN: Title`, `Status:`, `Date:` style.
- Glossary and decision files are written only when the task allows writes.
  Otherwise the proposed text goes in the conversation.
