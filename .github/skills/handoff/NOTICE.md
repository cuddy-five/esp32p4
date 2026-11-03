# Source and adaptation

Source: https://github.com/mattpocock/skills/tree/4ae2317ddb22b046e26455e4f9c9b3aaaf62212d/skills/productivity/handoff

License: MIT (Copyright (c) 2026 Matt Pocock). See `LICENSE` in this folder.

Retrieved 2026-11-03 from `mattpocock/skills` at commit
`4ae2317ddb22b046e26455e4f9c9b3aaaf62212d`.

## Files

- `SKILL.md`: rewritten for this repository from the upstream `handoff` skill.

## Local adaptations

- The upstream skill saves a handoff file to the system temporary directory.
  This version returns the handoff in the conversation and, for shared work,
  has the coordinator save it to Basic Memory project `main`.
- Adds this repository's handoff rules from `AGENTS.md` and
  `docs/runbooks/agent-team.md`: exact snapshot, actual checks, authorship,
  next responsible role, the optional JSON `handoff` contract, read-only
  requests and halt.
- Keeps the upstream "suggested skills" section, the rule to reference existing
  artifacts instead of duplicating them, and redaction of sensitive data.
- Removes `disable-model-invocation`, so agents can load the skill themselves,
  and the upstream `argument-hint`.
