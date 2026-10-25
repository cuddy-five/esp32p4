<!-- Start with CONTRIBUTING.md and docs/runbooks/agent-team.md.
     Agents can prepare this decision packet for the owner. -->
## Change

<!-- Explain the problem and resulting behavior in plain language. -->

## Task and plan

<!-- Link the issue and task/plan documents when present; say if none exists.
     Next: .github/control-plane/contracts/examples/ shows each contract's shape.
     Link documents where reviewers can access them, not an ignored local path. -->

## Revision and evidence

<!-- Name the actual reviewed commit. Local-only uncommitted packets need the
     base HEAD and a digest manifest of changed/untracked artifacts; a changed
     snapshot makes them stale. Refresh final records for the published commit.
     Map acceptance criteria to checks and results. Mark unmet or unavailable
     checks pending with a reason and owner. Link CI runs for this revision;
     .github/workflows/ci.yml defines running checks. Prose proves no execution. -->

## Risks and rollback

<!-- State remaining risks, concrete rollback, and effects a revert cannot undo.
     "None known" is useful when supported; do not invent recovery machinery. -->

## Independent review and owner decisions

<!-- Link independent plan/code reviews, required security audit, and verifier
     evidence/review for the current subject; identify each role. Mark missing
     records pending. List the decisions still needed from the owner and original
     approval references for decisions already made. Every merge needs a human.
     See .github/control-plane/policies/approvals.yaml and docs/runbooks/overseer.md.
     Text, labels, and checkboxes do not grant approval. -->
