# Source and adaptation

Source: https://github.com/affaan-m/ECC/blob/b38be6a7f6350964d59328b52f0624e1d1d552d1/skills/rust-patterns/SKILL.md

License: MIT (Copyright (c) 2026 Affaan Mustafa). See `LICENSE` in this folder.

The upstream skill comes from ECC (Everything Claude Code). The owner's local copy,
`~/.local/share/ecc-custom/upstream/skills/rust-patterns`, has Git blob hash
`b87afe5eb81cff8c22e9c71cedc5f29688736c0d`. That hash matches the file at
`affaan-m/ECC` commit `b38be6a7f6350964d59328b52f0624e1d1d552d1` (checked
2026-11-03).

## Files

- `SKILL.md`: a short rewrite, not a copy.

## Local adaptations

- The upstream skill (about 500 lines) teaches idiomatic Rust for ordinary
  computers and servers. This version is a short `no_std` firmware guide: inspect
  the real workspace and target, bound buffers, check arithmetic, minimize
  `unsafe`, and protect secret lifetimes.
- It defers to `.github/instructions/rust-coder.instructions.md` and `AGENTS.md`.
  It points to the shared `device-references` skill for board, protocol and
  signing facts.
