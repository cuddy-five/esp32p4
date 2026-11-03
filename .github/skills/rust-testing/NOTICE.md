# Source and adaptation

Source: https://github.com/affaan-m/ECC/blob/b38be6a7f6350964d59328b52f0624e1d1d552d1/skills/rust-testing/SKILL.md

License: MIT (Copyright (c) 2026 Affaan Mustafa). See `LICENSE` in this folder.

The upstream skill comes from ECC (Everything Claude Code). The owner's local copy,
`~/.local/share/ecc-custom/upstream/skills/rust-testing`, has Git blob hash
`464555b45ce646ea9396f63277be08f40d2ce49b`. That hash matches the file at
`affaan-m/ECC` commit `b38be6a7f6350964d59328b52f0624e1d1d552d1` (checked
2026-11-03).

## Files

- `SKILL.md`: a short rewrite, not a copy.

## Local adaptations

- The upstream skill (about 500 lines) covers unit, integration, async, mocking
  and coverage testing for ordinary Rust applications. This version keeps what
  applies to `no_std` wallet code: boundary and invalid-input tests, property
  tests where they fit, independent protocol vectors, and separate reporting of
  host tests, target builds and device tests.
- It defers to `.github/instructions/rust-coder.instructions.md` and `AGENTS.md`.
  It points to the shared `device-references` skill for test-vector sources.
