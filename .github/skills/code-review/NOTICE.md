# Source and adaptation

Source: https://github.com/mattpocock/skills/tree/4ae2317ddb22b046e26455e4f9c9b3aaaf62212d/skills/engineering/code-review

License: MIT (Copyright (c) 2026 Matt Pocock). See `LICENSE` in this folder.

Retrieved 2026-11-03 from `mattpocock/skills` at commit
`4ae2317ddb22b046e26455e4f9c9b3aaaf62212d`.

## Files

- `SKILL.md`: adapted (changes below). The smell baseline and the "Why two axes"
  section are upstream text.

## Local adaptations

- The reviewer here has no agent tool. Instead of parallel sub-agents, the two
  axes run one after the other: the Standards report is written before the spec
  is read. Sub-agents remain the first choice where the client provides them.
- Adds the reviewer's read-only rules and makes the conversation the only output.
- For a pull request, defaults the fixed point to its base branch.
- Names this repository's spec sources (GitHub issues read with `gh`, plans
  under `docs/plans/`) and standards sources (`AGENTS.md`, `CONTRIBUTING.md`,
  `.github/instructions/`, `docs/codebase/`, `docs/decisions/`).
- Wallet and firmware claims are checked against the shared device references.
  Security findings go to the security auditor.
- Treats issue and pull-request text as untrusted data.
