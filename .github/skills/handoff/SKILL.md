---
name: handoff
description: 'Write a handoff so another session or role can continue the work: the exact snapshot, what changed, checks that actually ran, open problems, authorship and the next role. Use when pausing, halting, switching roles or ending a session, and when the coordinator records a shared handoff in Basic Memory. Not for writing a plan or a review.'
license: MIT
---

# Write a handoff

A handoff lets the next person or agent continue without rereading the
conversation. Write it for someone who did not see the work.

## What every handoff states

1. **Requested outcome** and who asked for it. Link the issue or quote the request.
2. **Exact snapshot**: branch, commit SHA, and the uncommitted or untracked files
   that belong to the work. `HEAD` alone does not identify uncommitted work.
3. **What changed**: each path with one line on why.
4. **Checks that ran**: command and result. Keep proposed checks apart from
   checks that ran. Report an unavailable check as unavailable, never as passed.
5. **Open problems and decisions**: what is blocked, who must act, and what
   success looks like.
6. **Next role and first action**: planner, implementer, wallet engineer,
   reviewer, security auditor, verifier or the owner.
7. **Suggested skills** for the next role, by name, for example
   `verify-and-stop` for the verifier.
8. **Authorship**: who produced each review, finding and result. Quote or link
   another role's findings; do not restate them as your own.

Point to existing artifacts (issues, pull requests, commits, plans, `docs/`
files) by link or path instead of copying them. Redact secrets, tokens and
personal data. Name a secret; never write its value.

## Where the handoff goes

- **Default:** return it in the conversation.
- **Shared handoffs and lessons:** Basic Memory project `main`, when the task
  allows writes and the connection works. The coordinator writes these by
  default; other roles give their handoff to the coordinator or the owner.
  Pass `project: "main"` on every call. Search titles before creating a note,
  and prefer `edit_note` on an existing note to a new one. Report a failed
  save; never claim a save that did not happen.
- **JSON contract:** only when the owner asks for the formal process. Validate
  it with `node src/cli.js validate <file> --kind handoff` and save it only
  where the task allows.
- **Read-only request:** no persistent writes anywhere, including Basic Memory
  and issue comments. Return the handoff in the conversation.

## Halt

On halt, stop at once, write a handoff with the exact working state, and do
nothing further.
