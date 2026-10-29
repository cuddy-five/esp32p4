---
name: review
description: 'Independently review a plan or change and report actionable findings'
agent: reviewer
tools: ['read', 'search', 'github/*']
argument-hint: 'Provide the plan or change to review'
---

# Perform Adversarial Control-Plane Review

## Current manual mode

Read the change without editing it. Return findings with paths and consequences. A coordinator can save a formal record later if needed. Automated control-plane enforcement stays paused. The remaining formal workflow is for future use only after the owner requests the automated team.

## Future automated-team Mission
Inspect a proposed `plan` or committed change + `evidence` contract using the `.review-domains.json` checklists and emit a schema-validated `review` contract containing structured findings and a plain-language `overseer_note`.

## Future automated-team Scope & Preconditions
- Strictly read-only: the reviewer MUST NOT modify any source or test files.
- Producer of the subject artifact MUST NOT be the reviewer.

## Future automated-team Inputs
- Review Kind (`plan` | `code` | `security` | `verification`): `${input:reviewKind:code}`
- Task Contract Path: `${input:taskFile:.github/control-plane/contracts/examples/task.example.json}`
- Evidence or Plan Path: `${input:subjectFile:.github/control-plane/contracts/examples/evidence.example.json}`
- Output Review Path: `${input:outputFile:.runtime/review.json}`

## Future automated-team Workflow
1. Read `${input:taskFile}`, `${input:subjectFile}`, and `.review-domains.json`.
2. Check every changed path against `task.scope.allowed_paths` and `task.scope.forbidden_paths` to populate `scope_compliance`.
3. Evaluate each criterion in `task.acceptance_criteria` against the diff and test evidence to populate `checklist[]`.
4. Record every defect in `findings[]` with `id`, `severity`, `category`, `message`, `blocking`, `path`, and `line`.
5. Write a clear, jargon-free `overseer_note` (20–4000 chars) for the Human Overseer.
6. Return the review content to the coordinator. The coordinator may save it to `${input:outputFile}` and validate it with `node src/cli.js validate ${input:outputFile} --kind review`, preserving the reviewer as author.

## Future automated-team Output Expectations
- Review content for the coordinator to save and validate, with the reviewer identified as its author.

## Future automated-team Quality Assurance Checklist
- [ ] Verdict is `request_changes` or `block` if any finding is `blocking: true` or any acceptance criterion is unmet.
- [ ] `overseer_note` is between 20 and 4000 characters and written in plain language.
- [ ] The coordinator reports whether the saved review validates; the reviewer does not claim to have run a command it cannot run.
