---
name: implementation
description: 'Execute approved plan steps using TDD Red-Green-Refactor for Node 20+ ESM control-plane modules and ESP32-P4 #![no_std] Rust firmware.'
---

# Skill: Scoped TDD Implementation

## Current manual mode

Carry out the owner-requested change in small steps, preserve unrelated work, and run useful checks. Use test-first work when it fits; no formal contract is required. Automated control-plane enforcement stays paused. The remaining formal workflow is for future use only after the owner requests the automated team.

## Future automated-team When to Use
Load this skill when executing an approved `plan` contract in the `in_progress` state.

## Future automated-team Step-by-Step Procedure
1. **Pre-Flight Scope Check**: Confirm every target file is inside `task.scope.allowed_paths`.
2. **TDD Cycle**:
   - **Red**: Add a failing test in `tests/unit/` or `tests/security/` covering the step's acceptance criterion.
   - **Green**: Write minimal compliant code (pure planners, closed schemas, `--yes` mutation guards for JS; `#![no_std]`, `ZeroizeOnDrop`, `ConstantTimeEq`, checked arithmetic for Rust).
   - **Refactor**: Clean up duplication while keeping all tests green.
3. **Compact Diagnostics on Failure**: If test output is large, run `node src/cli.js compact --file <log> --offline --max-chars 2000` to preserve failure stack traces without flooding the context window.
4. **Emit Handoff**: Build and validate `handoff.json` (`node src/cli.js validate <handoff.json> --kind handoff`).