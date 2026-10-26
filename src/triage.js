/*
 * Triage synthesizer: turns Jev's System One routing advice + deterministic
 * registry & policy declarations into a schema-validated `task` or `escalation`
 * contract document.
 *
 * Non-negotiable boundary (AGENTS.md):
 * Jev never invents scope, budgets, or approvals. Scope and budget come
 * strictly from `.agents.registry.json`; required human stages come strictly
 * from `policies/approvals.yaml` via `requiredHumanStages()`.
 */
import crypto from "node:crypto";
import defaultRegistry from "./lib/registry.js";
import { ContractRegistry } from "./lib/contracts.js";
import { checkPolicies, requiredHumanStages } from "./lib/orchestration.js";

function makeId(prefix) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "")}`;
}

function formatTitle(text) {
  const clean = text.trim().replace(/\s+/g, " ").slice(0, 200);
  return clean.length >= 3 ? clean : `Task: ${clean}`;
}

export function synthesizeIntakeContract(requestText, advice, {
  registry = defaultRegistry,
  contracts = new ContractRegistry(),
  policies = {},
  now = new Date().toISOString(),
  issueNumber = undefined,
  requestedBy = "human",
} = {}) {
  if (typeof requestText !== "string" || !requestText.trim()) {
    throw new TypeError("requestText must be a non-empty string.");
  }
  if (!advice || typeof advice !== "object") {
    throw new TypeError("advice must be an interpreted Jev selection object.");
  }

  const correlationId = makeId("trace");
  const taskId = makeId("task");
  const modelName = String(advice.resolved_model || advice.requested_model || "jev");

  // 1. If Jev flagged prompt injection or needed clarification, emit an `escalation` contract.
  if (advice.disposition === "escalate_security" || advice.disposition === "clarify") {
    const isSecurity = advice.disposition === "escalate_security";
    const escalation = {
      contract: "escalation",
      schema_version: "1.0.0",
      id: makeId("esc"),
      created_at: now,
      producer: {
        kind: "system",
        name: "jev-intake-router",
        role: "coordinator",
        model: modelName,
      },
      trace: { correlation_id: correlationId },
      task_id: taskId,
      reason: isSecurity ? "security_concern" : "ambiguous_requirements",
      severity: isSecurity ? "high" : "low",
      status: "open",
      summary: isSecurity
        ? "Jev System One flagged a potential prompt injection or instruction-override attempt during intake."
        : "Jev System One could not confidently select a single workflow and agent for this request.",
      context: `Request text:\n\n> ${requestText.trim().replace(/\n/g, "\n> ")}`,
      requested_decision: isSecurity
        ? "Inspect the request for hostile instructions and decide whether to cancel or rewrite it."
        : "Clarify the desired single outcome and re-run intake.",
      overseer_note: isSecurity
        ? "Our fast routing sensor (Jev) flagged this request because it looks like it is trying to override rules or change agent roles. The request is paused so you can inspect it and decide whether to cancel it."
        : "Our fast routing sensor (Jev) was not confident which workflow and agent fit this request best. Rather than guessing and spending budget, it paused to ask you to clarify what outcome you want.",
      options: [
        {
          id: "opt-restate",
          description: "Restate the request with a single clear outcome and re-run intake",
          recommended: !isSecurity,
        },
        {
          id: "opt-cancel",
          description: "Cancel the request",
          recommended: isSecurity,
        },
      ],
      ...(Number.isInteger(issueNumber) && issueNumber > 0
        ? { related: { issue: { number: issueNumber } } }
        : {}),
    };

    const validation = contracts.validate(escalation, { kind: "escalation" });
    if (!validation.ok) {
      throw new Error(`Synthesized escalation failed validation: ${JSON.stringify(validation.errors)}`);
    }
    return { kind: "escalation", contract: escalation, human_stages: ["plan", "merge"] };
  }

  // 2. Confident routing -> synthesize a `task` contract in state `proposed`.
  const workflowId = advice.selections?.workflow?.choice;
  const agentId = advice.selections?.agent?.choice;
  const skillId = advice.selections?.skill?.choice ?? null;
  if (!workflowId || !agentId) {
    throw new Error("Cannot synthesize a task contract without both a workflow and an agent selection.");
  }

  const agentDef = registry.lookupAgent(agentId);
  const workflowDef = registry.lookupWorkflow(workflowId);

  let riskLevel = advice.guardrails?.risk_level ?? "low";
  if (
    Array.isArray(workflowDef.required_for_risk_levels) &&
    workflowDef.required_for_risk_levels.length > 0 &&
    riskLevel === "low"
  ) {
    riskLevel = workflowDef.required_for_risk_levels[0];
  }
  const riskTags = advice.guardrails?.risk_tags ?? [];

  const { approvals } = checkPolicies(policies);
  const stageInfo = requiredHumanStages(approvals, {
    risk: { level: riskLevel, tags: riskTags },
    paths: agentDef.scope.allowed_paths,
  });

  const roleLabel = `role:${agentId.replace(/_/g, "-")}`;
  const labels = ["cp:task", `risk:${riskLevel}`, roleLabel];

  const task = {
    contract: "task",
    schema_version: "1.0.0",
    id: taskId,
    created_at: now,
    producer: {
      kind: "system",
      name: "jev-intake-router",
      role: "coordinator",
      model: modelName,
    },
    trace: { correlation_id: correlationId },
    title: formatTitle(requestText),
    intent: requestText.trim(),
    acceptance_criteria: [
      {
        id: "ac-1",
        statement: `Complete the ${workflowDef.name} (${workflowId}) workflow using role ${agentId} within declared scope.`,
        verification: agentId === "reviewer" || agentId === "security_auditor" ? "review" : "automated_test",
      },
    ],
    scope: {
      allowed_paths: agentDef.scope.allowed_paths,
      forbidden_paths: agentDef.scope.forbidden_paths,
      network_access: "none",
    },
    risk: {
      level: riskLevel,
      requires_human_approval: stageInfo.stages.length > 0,
      rationale: `Jev routed to ${workflowId}/${agentId}; human approval required at [${stageInfo.stages.join(", ")}] (${stageInfo.reasons.join(", ")}).`,
      ...(riskTags.length > 0 ? { tags: riskTags } : {}),
    },
    status: "proposed",
    source: {
      kind: Number.isInteger(issueNumber) && issueNumber > 0 ? "issue" : "manual",
      ...(Number.isInteger(issueNumber) && issueNumber > 0 ? { issue: { number: issueNumber } } : {}),
      requested_by: requestedBy,
    },
    budget: {
      tokens: agentDef.budget.max_tokens_per_request,
      wall_clock_seconds: Math.floor((agentDef.timeout_ms ?? 300000) / 1000),
    },
    labels,
    assigned_role: agentId,
    annotations: {
      jev_workflow: workflowId,
      jev_workflow_confidence: String(advice.selections.workflow.confidence),
      jev_agent_confidence: String(advice.selections.agent.confidence),
      ...(skillId ? { jev_skill: skillId } : {}),
    },
  };

  const validation = contracts.validate(task, { kind: "task" });
  if (!validation.ok) {
    throw new Error(`Synthesized task failed validation: ${JSON.stringify(validation.errors)}`);
  }
  return { kind: "task", contract: task, human_stages: stageInfo.stages };
}