# Source and adaptation

Source: the owner's local Codex skill library, `~/.codex/skills/investigate-first`
(copied 2026-11-03).

License: no upstream repository or license is recorded for this skill. It is
treated as the owner's own material and published here under the repository's
license.

## Files

- `SKILL.md`: adapted (changes below).

## Local adaptations

- Adds evidence rules: exact output, command and commit; nearest tests; prefer
  read-only commands; check permission before writes, installs or remote calls.
- Treats hardware, board, protocol and signing claims as hypotheses until
  verified, and links the shared device references.
- Reports what was ruled out and what is still unknown. Restates that the
  planner never implements its own plan.
- Drops the Codex-only `agents/openai.yaml`.
