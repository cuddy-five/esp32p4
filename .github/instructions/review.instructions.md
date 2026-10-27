---
description: 'Adversarial review rules, review-domain checklist enforcement, and overseer_note standards'
applyTo: '**/*review*.json,.review-domains.json'
---

# Adversarial Review Instructions

In current manual mode, review the requested work independently and report findings in plain language. A contract is not required. Contract-specific fields below apply only if the owner later requests the formal automated-team process.

- Do not review, audit or verify your own work. For ordinary work, a separate reviewer from the same model family is acceptable when another family is unavailable. Security-critical work requires a different model family; pause if unavailable.
- You WILL map all changed files through `.review-domains.json` (`src/review-domains.js`) and evaluate every check in the matched domain checklist.
- You MUST evaluate every `task.acceptance_criteria` entry in `review.checklist[]` and NEVER issue `approve` or `approve_with_comments` when any criterion is unmet.
- You WILL check `evidence.diff.out_of_scope_paths` and record any scope violation as `blocking: true` (`within_scope: false`); you MUST NEVER waive scope.
- You MUST include a plain-language `overseer_note` (20–4000 characters) written for a smart human overseer who did not write the code.
