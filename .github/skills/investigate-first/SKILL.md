---
name: investigate-first
description: 'Diagnose an unclear failure or question before anyone edits code: separate symptom from cause, rank hypotheses by evidence, and stop when one mechanism explains the evidence. Use for unknown causes, intermittent behavior, surprising check results, or claims that need checking before a plan relies on them.'
---

# Investigate first

Gather evidence before changing anything.

- Separate the observed symptom from the inferred cause. Quote the exact error,
  output or behavior, with the command and the commit it ran against.
- Trace inputs, state changes, ownership boundaries and failure output. Read
  the code path and its nearest tests; do not stop at the first plausible file.
- Rank hypotheses by how well they explain the evidence and how cheaply each
  one can be ruled out. Test the cheapest decisive one first.
- Prefer commands that only read. Before running a command that writes files,
  installs tools, starts services or calls a remote service, check that the
  task allows it.
- Do not edit until one credible mechanism explains all the evidence.
- Stop when the evidence names the cause or the exact blocker.

Hardware, board, protocol and signing claims count as hypotheses until a
primary source or a reproducible check confirms them. The
[device references](../device-references/SKILL.md) record which ones are
already checked.

Report the cause, the proof, what you ruled out, and what is still unknown.
Make no fix unless the task authorizes implementation; the planner never
implements its own plan.
