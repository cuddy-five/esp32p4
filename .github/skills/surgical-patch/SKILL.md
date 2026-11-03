---
name: surgical-patch
description: 'Fix a bug or make a small behavior change at the narrowest layer that owns it, with a regression test and nothing else. Use for repairs where preserving surrounding behavior matters. Not for new features (use lean-build) or for reviewing a change.'
---

# Surgical patch

Reproduce the failure first when that is cheap; otherwise capture the strongest
evidence available (failing test, exact error, command and commit).

- Trace the symptom to the mechanism that causes it.
- Change the narrowest layer that owns the wrong behavior.
- Preserve unrelated behavior and other people's uncommitted work. Check
  `git status` before you start and again before you finish.
- Do not clean up, rename or abstract anything outside the fix.
- Add only the regression proof the fix needs, in `tests/unit/` or
  `tests/security/` with `node:test`, or beside the Rust code it covers.

## Proof

Run the focused test first, then the nearest affected gate. For the control
plane that usually means:

```bash
node --test tests/unit/<file>.test.js   # focused proof
npm test                                # all suites
npm run validate:examples               # when contracts or examples change
node src/cli.js policy check            # when policies or the state machine change
git diff --check                        # whitespace errors
```

Stop when the failure is fixed and the regression proof passes. Report the
cause, the changed paths, the commands with their actual results, and anything
you saw but left alone. A separate reviewer and verifier check your work; do
not review or verify it yourself.
