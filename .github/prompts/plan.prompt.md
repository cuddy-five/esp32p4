---
name: plan
description: 'Prepare a small plan for an owner-requested task or GitHub issue'
agent: planner
tools: ['read', 'search', 'edit', 'execute', 'web', 'github/*', 'context7/*', 'todo']
argument-hint: 'Describe the task or provide an issue link'
---

# Plan the requested change

Use the repository [planning skill](../skills/planning/SKILL.md). First use
[acquire-codebase-knowledge](../skills/acquire-codebase-knowledge/SKILL.md) to
establish or refresh relevant knowledge. Reuse `docs/codebase/` when present,
verify cited sources against current files, and build missing knowledge in chat
unless saving documentation is authorized. Base plan steps on that evidence.

Inspect the request and relevant files. Return a plain-language plan with outcome,
allowed files or area, steps, useful acceptance checks, unresolved decisions and
the next role. Distinguish observed evidence from assumptions. Do not implement
or publish the plan. Save it only when that action is authorized. A read-only
request requires a chat-only result, including its handoff.

Ordinary work does not require JSON contracts. If the owner explicitly requests
one, follow the planning skill's
[formal reference](../skills/planning/references/formal-plan-contracts.md) and
validate it. Automated control-plane enforcement remains paused.

This prompt is an editor convenience. In Copilot CLI, select the
[planner profile](../agents/planner.agent.md) and describe the request directly;
do not assume this prompt file was loaded.
