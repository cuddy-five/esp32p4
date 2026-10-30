---
name: review
description: 'Conduct adversarial plan, code, and security reviews mapped to .review-domains.json and emit closed review contracts with CWE tags and overseer_note summaries.'
---

# Skill: Adversarial Domain Review & Security Audit

## Current manual mode

Independently review the requested change without fixing it. Follow the reviewer profile's read-only shell rules; shell availability does not enforce read-only access. Report concrete findings and checks in plain language; no review contract is required. Automated control-plane enforcement stays paused. The remaining formal workflow is for future use only after the owner requests the automated team.

## Future automated-team When to Use
Load this skill when inspecting a `plan` (`review_kind: "plan"`) or an implementation diff + `evidence` (`review_kind: "code"` or `"security"`) in the `planning` or `in_review` states.

## Future automated-team Step-by-Step Procedure
1. **Verify Independence**: Use a different reviewer from the producer. For ordinary work, the same model family is acceptable when another is unavailable. Security-critical work requires a different family; pause if unavailable.
2. **Evaluate Review Domains**: Run `node src/cli.js evidence --task <task.json> --sha <sha> --path <file>...` to inspect the matched checklists from `.review-domains.json` (`control-plane` and/or `firmware`).
3. **Check Acceptance & Scope**:
   - Mark every `task.acceptance_criteria` item in `review.checklist[]` (`satisfied: true|false`).
   - Record any file outside `task.scope.allowed_paths` in `review.scope_compliance.violations` and force `verdict: "request_changes"` or `"block"`.
4. **Return Review & Validate**: Return the review content with `overseer_note` (20–4000 chars) to the coordinator for saving. The reviewer may validate an existing authorized file with `node src/cli.js validate <review.json> --kind review`; it must not save a file or claim an unrun check.
