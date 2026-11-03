---
name: verify-and-stop
description: 'Prove that finished work meets its acceptance conditions with your own fresh checks, report pass, fail, unavailable or blocked exactly, then stop. Use for independent verification, completion checks and merge-readiness evidence. Not for fixing, reviewing or extending the work.'
---

# Verify and stop

Turn the acceptance conditions into the smallest set of checks that proves them.

- **Bind the snapshot.** Record the commit SHA, and for uncommitted work the
  changed and untracked files that belong to it. Check against exactly that.
- **Run the checks yourself.** Never count the implementer's or reviewer's test
  run as yours. Reuse a result only if you produced it on the same snapshot.
- Run focused checks first, then the wider gates. For the control plane:
  `npm test`, `npm run validate:examples`, `node src/cli.js policy check`,
  `git diff --check`, and `npm run package:smoke` when packaging changes.
- Report each condition as **pass**, **fail**, **unavailable** (the tool,
  hardware or access is missing) or **blocked** (something must happen first).
  Never report an unrun check as passed.
- Do not edit source or tests. If a check needs persistent writes the task did
  not authorize, report that instead of running it.
- Do not add polish, cleanup or extra tests once the conditions pass.

Stop as soon as the proof is complete. Report the snapshot, each command with
its result, and any unresolved risk, and name who acts next. Schema validity,
labels and passing CI do not prove human approval or review authorship.
