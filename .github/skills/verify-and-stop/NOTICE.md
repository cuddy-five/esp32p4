# Source and adaptation

Source: the owner's local Codex skill library,
`~/Documents/Skills/Codex/.archive/verify-and-stop` (copied 2026-11-03; the same
text is stored in
`~/Documents/Skills/Codex/.sources/Claude/3496e13e99d1d7a7/verify-and-stop`).

License: no upstream repository or license is recorded for this skill. It is
treated as the owner's own material and published here under the repository's
license.

## Files

- `SKILL.md`: adapted (changes below).

## Local adaptations

- Upstream allowed reusing any still-current result. This version reuses only
  the verifier's own results from the same snapshot and never counts the
  builder's run, as the agreed design requires.
- Adds snapshot binding, this repository's gates, and exact definitions of
  unavailable and blocked.
- Adds that schema validity, labels and CI do not prove approval or authorship,
  and names who acts next.
- Adds that a denied asked command is unavailable and a substitute is reported
  separately, after a live run (issue #8, 2026-11-07) hid two denied commands.
- Drops the Codex-only `agents/openai.yaml`.
