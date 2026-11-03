---
name: rust-patterns
description: 'Rust guidance for the wallet engineer: no_std firmware patterns, bounded buffers, checked arithmetic, minimal unsafe and secret hygiene, applied to the real Cargo workspace and target. Use when writing or changing Rust in this repository.'
license: MIT
---

# rust-patterns

Inspect the actual Cargo workspace, features and target first. Prefer borrowed
slices, clear ownership and typed errors. Bound buffers and check arithmetic.
Keep firmware no_std; host conveniences must not leak into runtime code.
Minimize unsafe and explain its safety requirements. Protect secret lifetimes,
avoid secret logs and copies, and clear sensitive buffers. Follow the linked
Rust instructions and verify protocol behavior with independent vectors.

Check board, chip, protocol and signing facts against the
[device references](../device-references/SKILL.md) before relying on them.

Follow [Rust instructions](../../instructions/rust-coder.instructions.md) and
[AGENTS.md](../../../AGENTS.md). Keep work within the owner request.
