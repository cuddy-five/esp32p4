---
name: rust-testing
description: 'Check Rust changes with boundary tests, protocol vectors, and the available host and target toolchains. Use when testing wallet or firmware Rust, and report host tests, target builds and device tests separately.'
license: MIT
---

# rust-testing

Read existing tests and the requested checks first. Add regression tests for
changed behavior when useful. Cover invalid input and boundaries. Use existing
property tests where appropriate, plus independent protocol vectors. Run relevant
Cargo tests, checks, Clippy and formatting checks using the real package and target.
Do not invent target names or install tools. Report commands and actual results,
separating host tests, target builds and device tests.

Take test vectors from the primary sources listed in the
[device references](../device-references/SKILL.md), never from a summary.

Follow [Rust instructions](../../instructions/rust-coder.instructions.md) and
[AGENTS.md](../../../AGENTS.md). Keep work within the owner request.
