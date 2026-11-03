---
name: skill-creator
description: 'Create or update a Copilot agent skill for this repository: a SKILL.md with a precise name and description, only the supporting files the work needs, a source and license notice for adapted material, and a check that the right agents load it. Use when the Foundry adds, adapts or reviews a skill. Not for writing an agent profile on its own.'
license: Apache-2.0
---

# Skill Creator

Create skills that give an agent useful, non-obvious guidance without
constraining unrelated work.

## Core principles

**Assume the agent is already capable.** Include only information that changes
its decisions or improves its work. Remove generic advice, repeated
instructions, speculative edge cases and examples that do not clarify the task.

**Preserve the owner's intent and scope.** A skill supports the requested work.
It does not replace the owner's chosen tools, expand the assignment, modify
unrelated configuration, or imply permission for external actions. Do not turn
one example, past failure or preference into a universal rule. A skill never
grants tools: the agent profile's `tools` list decides what an agent can do.

**Match specificity to the risk.** Leave room to choose when several approaches
are reasonable. Use fixed steps, scripts or absolute language only where
correctness, safety, permissions or a fragile workflow require them.

**Keep discovery cheap and precise.** Every agent sees every enabled skill's name
and description before choosing one, so the description must say what the skill
does and when it applies, plus an exclusion where misrouting is likely. Avoid
catch-all descriptions that attract unrelated requests. Specialized review,
hardening or audit skills should apply when requested or genuinely needed, not
whenever ordinary work touches the same subject.

**Disclose detail progressively.** Keep purpose, essential constraints and
routing in `SKILL.md`. Put substantial mode-specific material in supporting
files and link each one from the place where it becomes relevant.

## How Copilot loads skills here

Verified with Copilot CLI 1.0.105 on 2026-11-03
([agent tools runbook](../../../docs/runbooks/agent-tools.md)):

1. **Name and description** of every enabled skill reach every agent: project,
   personal, plugin and built-in skills alike. No per-agent filter exists.
2. **Full `SKILL.md` text** is preloaded for the skills a profile lists under
   `skills:`. Other skills load on demand through the `skill` tool, which every
   agent has.
3. **Supporting files** are read only when the instructions send the agent to them.

So keep each profile's `skills:` list short (at most three; a test enforces
this), name the optional skills in the profile body, and write descriptions that
route correctly.

## Anatomy of a skill

```text
.github/skills/<skill-name>/
|-- SKILL.md        Required: YAML frontmatter plus instructions
|-- NOTICE.md       Required for adapted material: source, license, changes
|-- LICENSE         Upstream license text for third-party material
|-- references/     Optional: material read only when needed
|-- scripts/        Optional: executable helpers
`-- assets/         Optional: files used in generated output
```

Create only the folders and files the workflow needs. Avoid README files,
changelogs and placeholders.

### Frontmatter

Copilot reads these fields:

- `name` (required): lowercase letters, digits and hyphens here, at most 64
  characters, matching the folder name.
- `description` (required): what the skill does and when to use it, at most
  1024 characters.
- `license`: the SPDX identifier of adapted third-party material, matching
  `NOTICE.md`.
- `argument-hint`, `user-invocable`, `disable-model-invocation`: optional.
  Set `disable-model-invocation: true` only when the owner wants a skill to start
  only from an explicit `/skill-name`.
- **Never set `allowed-tools`.** It pre-approves tools while the skill is active
  and bypasses permission prompts. A repository test rejects it.

### Scripts

Add a script only when the same logic would otherwise be rewritten repeatedly or
deterministic execution clearly helps. Run new or changed scripts to verify
them. A script must not read the files the repository secret policy protects,
write outside its intended output, or reach the network unless the skill exists
for that. Do not vendor an upstream script you have not read.

## Create or adapt a skill

1. Confirm the need: which agent needs it, for which tasks, and why existing
   skills and instructions do not cover it.
2. For adapted material, pin the source to a commit, record the license, and keep
   the upstream license text in `LICENSE`. Copy supporting files unchanged where
   possible; adapt `SKILL.md` to this repository's tools, paths and manual-mode
   rules. List every change in `NOTICE.md`. ShareAlike material (for example
   CC-BY-SA-4.0) stays under its license.
3. Write the instructions an agent needs here: outcome, non-obvious context, real
   constraints and links. Keep `AGENTS.md` rules intact: read-only requests,
   secrets, owner authority, independent review.
4. Wire it to agents: add it to at most three profiles' `skills:` lists only if
   those agents need it on every run; otherwise name it as optional in the
   profile's **Skills** line.
5. Check it: run `npm test` (frontmatter, notice, license and profile checks)
   and `copilot skill list` to confirm discovery. Confirm that the intended agent
   actually loads it with a live run, after the owner agrees to the premium
   request it costs. Record the result in `docs/runbooks/agent-tools.md`.

Improve a skill from real use or demonstrated failures. Prefer a narrow
correction to piling up universal rules.
