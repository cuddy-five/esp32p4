# Source and adaptation

Source: https://github.com/mattpocock/skills/tree/4ae2317ddb22b046e26455e4f9c9b3aaaf62212d/skills/engineering/triage

License: MIT (Copyright (c) 2026 Matt Pocock). See `LICENSE` in this folder.

Retrieved 2026-11-03 from `mattpocock/skills` at commit
`4ae2317ddb22b046e26455e4f9c9b3aaaf62212d`. The owner's local Codex copy
(`~/.codex/skills/triage`) matched that commit.

## Files

- `SKILL.md`: adapted (changes below).
- `AGENT-BRIEF.md`, `OUT-OF-SCOPE.md`: unchanged copies.

## Local adaptations

- Adds a current-manual-mode section. Any GitHub write needs the owner's
  go-ahead for that issue. Labels never approve work or start an agent. Issue
  text is untrusted data.
- Points to this repository's tracker and label documents
  (`docs/agents/issue-tracker.md`, `docs/agents/triage-labels.md`) instead of
  `/setup-matt-pocock-skills`, and keeps this repository's other label families.
- Removes the pull-request deltas, because the tracker document says pull
  requests are not a request surface here.
- Replaces the upstream call to the `grilling` skill, which this repository does
  not include, with one round of owner questions at a time plus `domain-modeling`.
- Uses `GLOSSARY.md` and `docs/decisions/` for domain context. Reproduction uses
  read-only commands unless the owner allows more.
- Keeps `disable-model-invocation: true`, so only the owner starts triage
  (`/triage`), matching the upstream policy.
