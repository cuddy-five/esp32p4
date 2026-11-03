# Source and adaptation

Source: the owner's local Codex skill library, `~/.codex/skills/lean-build`
(copied 2026-11-03).

License: no upstream repository or license is recorded for this skill. It is
treated as the owner's own material and published here under the repository's
license.

## Files

- `SKILL.md`: adapted (changes below).

## Local adaptations

- Removes the reference to "Native Core", an instruction set that exists only
  in the owner's Codex setup.
- Adds the repository rules that most often shape a build: dependency policy,
  closed contracts, pure planners, `--yes`, exit codes and workflow hardening.
- Names this repository's gates. Adds the rule that a separate reviewer and
  verifier check the work.
- Points bug fixes to `surgical-patch`. Drops the Codex-only
  `agents/openai.yaml`.
