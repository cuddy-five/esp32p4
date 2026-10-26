/*
 * Evidence builder & scope/budget gate evaluator.
 *
 * Implements the deterministic logic behind the state-machine gates:
 * - evidence_collected: produces a schema-validated `evidence` contract
 * - within_scope: computes `diff.out_of_scope_paths` against `task.scope`
 * - within_budget: checks `budget_used` against `task.budget` ceilings
 */
import crypto from "node:crypto";
import { ContractRegistry } from "./lib/contracts.js";
import { globMatch } from "./lib/orchestration.js";
import { loadReviewDomains, reviewDomainProblems, selectReviewDomains } from "./review-domains.js";

function makeId(prefix) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "")}`;
}

/**
 * Determine whether a repository-relative path is permitted by `task.scope`.
 * Forbidden paths always win; when `allowed_paths` is present, the path must
 * match at least one allowed glob.
 *
 * @param {string} filePath
 * @param {{ allowed_paths?: string[], forbidden_paths?: string[] }} [scope]
 * @returns {boolean}
 */
export function isPathInScope(filePath, scope = {}) {
  const forbidden = Array.isArray(scope?.forbidden_paths) ? scope.forbidden_paths : [];
  if (forbidden.some((pattern) => globMatch(pattern, filePath))) {
    return false;
  }
  if (Array.isArray(scope?.allowed_paths)) {
    if (scope.allowed_paths.length === 0) return false;
    return scope.allowed_paths.some((pattern) => globMatch(pattern, filePath));
  }
  return true;
}

/**
 * Compute all changed paths that violate `task.scope`.
 * @param {string[]} paths
 * @param {{ allowed_paths?: string[], forbidden_paths?: string[] }} [scope]
 * @returns {string[]}
 */
export function findOutOfScopePaths(paths, scope = {}) {
  const unique = [...new Set(paths)];
  return unique.filter((p) => !isPathInScope(p, scope));
}

/**
 * Evaluate `budget_used` against `task.budget` ceilings.
 * @param {Record<string, number>} [budgetUsed]
 * @param {Record<string, number>} [budgetCeiling]
 * @returns {{ withinBudget: boolean, details: string }}
 */
export function evaluateBudget(budgetUsed = {}, budgetCeiling = {}) {
  if (!budgetCeiling || typeof budgetCeiling !== "object") {
    return { withinBudget: true, details: "unbounded" };
  }
  const violations = [];
  const summaries = [];
  for (const [metric, limit] of Object.entries(budgetCeiling)) {
    if (!Number.isFinite(limit)) continue;
    const used = budgetUsed?.[metric] ?? 0;
    summaries.push(`${metric}: ${used} of ${limit}`);
    if (used > limit) {
      violations.push(`${metric} exceeded (${used} > ${limit})`);
    }
  }
  if (violations.length > 0) {
    return { withinBudget: false, details: violations.join("; ") };
  }
  return { withinBudget: true, details: summaries.join(", ") || "within ceiling" };
}

/** Map paths to required checklists. This does not attest that reviews occurred. */
export function evaluateReviewDomains(paths = [], domainsDoc = loadReviewDomains()) {
  if (!Array.isArray(paths)) throw new TypeError("Review domain selection needs relative file paths.");
  const problems = reviewDomainProblems(domainsDoc);
  if (problems.length > 0) throw new Error(problems.join(" "));
  const unique = [...new Set(paths)];
  const { covered, uncovered } = unique.length === 0
    ? { covered: [], uncovered: [] }
    : selectReviewDomains(unique, domainsDoc);
  return {
    covered,
    uncovered,
    required_roles: [...new Set(covered.map((row) => row.role))],
    required_security_roles: [...new Set(covered.map((row) => row.security_role).filter(Boolean))],
  };
}

/** Build and validate an evidence contract and return its reporting envelope. */
export function buildEvidenceContract(task, {
  sha,
  baseSha = undefined,
  paths = [],
  additions = 0,
  deletions = 0,
  filesChanged = paths.length,
  tests = undefined,
  checks = undefined,
  budgetUsed = undefined,
  reviewDomains = undefined,
  producerName = "collect-evidence",
  producerKind = "workflow",
  producerRole = undefined,
  now = new Date().toISOString(),
  contracts = new ContractRegistry(),
} = {}) {
  if (!task || typeof task !== "object" || task.contract !== "task") {
    throw new TypeError("buildEvidenceContract requires a valid task contract object.");
  }
  if (typeof sha !== "string" || !/^[0-9a-f]{40}$/.test(sha)) {
    throw new TypeError("buildEvidenceContract requires a 40-character lowercase hex commit sha.");
  }

  const domainEval = evaluateReviewDomains(paths, reviewDomains);
  const uniquePaths = [...new Set(paths)];
  const outOfScope = findOutOfScopePaths(uniquePaths, task.scope);
  const withinScope = outOfScope.length === 0;
  const budgetEval = evaluateBudget(budgetUsed, task.budget);

  const policyResults = [
    {
      policy: "scope.paths",
      outcome: withinScope ? "pass" : "fail",
      ...(withinScope ? {} : { severity: "high", details: `Out of scope: ${outOfScope.join(", ")}` }),
      evaluated_by: producerName,
    },
    {
      policy: "budget.ceiling",
      outcome: budgetEval.withinBudget ? "pass" : "fail",
      details: budgetEval.details,
      evaluated_by: producerName,
    },
    {
      policy: "review.domains",
      outcome: uniquePaths.length === 0 ? "skipped" : domainEval.uncovered.length > 0 ? "warn" : "pass",
      ...(domainEval.uncovered.length > 0 ? { severity: "medium" } : {}),
      details: uniquePaths.length === 0
        ? "No changed paths to map. Mapping is not proof of completed reviews."
        : [
          `Covered: ${domainEval.covered.map((row) => `${row.domain} (role: ${row.role}${row.security_role ? `, security_role: ${row.security_role}` : ""})`).join("; ") || "none"}.`,
          ...(domainEval.uncovered.length > 0 ? [`Uncovered paths: ${domainEval.uncovered.join(", ")}.`] : []),
          "Mapping is not proof of completed reviews.",
        ].join(" "),
      evaluated_by: producerName,
    },
  ];

  const evidence = {
    contract: "evidence",
    schema_version: "1.0.0",
    id: makeId("evidence"),
    created_at: now,
    collected_at: now,
    producer: {
      kind: producerKind,
      name: producerName,
      ...(producerRole ? { role: producerRole } : {}),
    },
    ...(task.trace?.correlation_id
      ? { trace: { correlation_id: task.trace.correlation_id, parent_id: task.id } }
      : {}),
    task_id: task.id,
    subject: {
      ...(task.scope?.repository ? { repository: task.scope.repository } : {}),
      sha,
    },
    ...(Array.isArray(checks) ? { checks } : {}),
    ...(tests ? { tests } : {}),
    diff: {
      ...(baseSha ? { base_sha: baseSha } : {}),
      files_changed: filesChanged,
      additions,
      deletions,
      paths: uniquePaths,
      out_of_scope_paths: outOfScope,
    },
    policy_results: policyResults,
    ...(budgetUsed ? { budget_used: budgetUsed } : {}),
  };

  const validation = contracts.validate(evidence, { kind: "evidence" });
  if (!validation.ok) {
    throw new Error(`Built evidence failed schema validation: ${JSON.stringify(validation.errors)}`);
  }

  return {
    evidence,
    review_domains: domainEval,
    gates: {
      evidence_collected: true,
      within_scope: withinScope,
      within_budget: budgetEval.withinBudget,
    },
  };
}
