# ADR 0002: Human-directed team template

Status: proposed for owner review.

## Context

The repository validates contracts and policy declarations, but has no running
agent coordinator, approval authenticator, evidence collector or merge gate.
Owners need a usable process today without choosing a consumer's product,
language, hardware or deployment from the template name.

## Decision

Provide a [manual team runbook](../runbooks/agent-team.md) and
[project brief](../templates/project-brief.md), linked from contribution and
agent entry points. Reuse the seven existing contracts. Separate planning,
implementation, review, security audit and verification; integrate parallel
work before checks and reviews bind to an exact snapshot. Every merge requires
a human decision. Scope expansion requires human resolution and a new reviewed
plan. Treat missing checks as pending and dirty-tree proof as local-only until
evidence and reviews name the actual committed subject.

## Consequences

The owner receives one concise packet with results, independent findings,
unmet checks, decisions and rollback. No new service, schema, dependency or
runtime profile is added. Human discipline remains necessary: schema validity
does not prove truth, identity or approval, and declared gates do not execute.
Automation and consumer runtime choices require separate tasks. Existing
repository protections must be inspected and configured during adoption.
