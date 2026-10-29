---
description: 'Testing conventions for node:test unit/security suites and TDD Red-Green-Refactor workflows'
applyTo: 'tests/**/*.test.js,tests/**/*.js'
---

# Testing Instructions

- You WILL use Node's built-in `node:test` (`describe`, `test`) and `node:assert/strict` for all JavaScript test suites.
- You MUST mock all GitHub REST API interactions using `tests/helpers/fake-github.js` and assert exact HTTP method, path, and body payloads.
- You WILL test both valid contract examples and negative rejection cases whenever adding or modifying contract schemas or orchestration gates.
- You MUST keep live paid API calls isolated from `npm test` so CI unit/security suites run deterministically offline.
- You WILL verify that `tests/unit/selection-registry-lint.test.js` passes whenever editing `.agents.registry.json`, `.workflows.registry.json`, or `.skills.registry.json`.