---
name: rust-patterns
description: 'Practical Rust guidance for scoped implementation and checks.'
---

# rust-patterns

Inspect the actual Cargo workspace, features and target first. Prefer borrowed
slices, clear ownership and typed errors. Bound buffers and check arithmetic.
Keep firmware no_std; host conveniences must not leak into runtime code.
Minimize unsafe and explain its safety requirements. Protect secret lifetimes,
avoid secret logs and copies, and clear sensitive buffers. Follow the linked
Rust instructions and verify protocol behavior with independent vectors.

Follow [Rust instructions](../../instructions/rust-coder.instructions.md) and
[AGENTS.md](../../../AGENTS.md). Keep work within the owner request.
