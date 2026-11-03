# Source and adaptation

Source: https://github.com/github/awesome-copilot/tree/8178d1939a203f691067073dcab2a3f1e14072d3/skills/test-gap-audit

License: MIT. The skill declares `license: MIT`. The Awesome Copilot repository
is MIT-licensed (Copyright GitHub, Inc.); see `LICENSE` in this folder.

Retrieved 2026-11-03 from `github/awesome-copilot` at commit
`8178d1939a203f691067073dcab2a3f1e14072d3`, listed on
https://awesome-copilot.github.com/skills/. The skill text names
https://github.com/specialone0007/review-skills as its family of review skills.

## Files

- `SKILL.md`: adapted (changes below).
- `scripts/coverage_map.py`: **not copied**. It walks every tracked and
  untracked file and reads manifests and test files without excluding the paths
  this repository's secret policy protects. The skill explains how to do the same
  coverage mapping by hand.

## Local adaptations

- Replaces the script step with a manual coverage-mapping procedure.
- Removes the "Related Skills" section, which names skills that are not in this
  repository.
- Adds an "In this repository" section: `node:test` locations, the GitHub fake,
  test expectations in `AGENTS.md`, the absence of a firmware crate, and
  read-only use by reviewers.
