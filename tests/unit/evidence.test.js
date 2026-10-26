import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  buildEvidenceContract,
  evaluateBudget,
  findOutOfScopePaths,
  isPathInScope,
} from "../../src/evidence.js";
import { ContractRegistry } from "../../src/lib/contracts.js";
import { CONTRACTS_DIR } from "../../src/lib/paths.js";

const contracts = new ContractRegistry();
const taskExample = JSON.parse(
  fs.readFileSync(path.join(CONTRACTS_DIR, "examples", "task.example.json"), "utf8"),
);
const VALID_SHA = "0123456789abcdef0123456789abcdef01234567";

describe("isPathInScope / findOutOfScopePaths", () => {
  const scope = {
    allowed_paths: ["src/**", "tests/**"],
    forbidden_paths: [".env*", "src/secret/**"],
  };

  test("allows matching paths and rejects forbidden or unlisted paths", () => {
    assert.equal(isPathInScope("src/cli.js", scope), true);
    assert.equal(isPathInScope("tests/unit/cli.test.js", scope), true);
    assert.equal(isPathInScope(".env.local", scope), false);
    assert.equal(isPathInScope("src/secret/key.js", scope), false);
    assert.equal(isPathInScope("docs/README.md", scope), false);
  });

  test("empty allowed_paths (such as reviewer role) rejects all file modifications", () => {
    assert.equal(isPathInScope("src/cli.js", { allowed_paths: [], forbidden_paths: [] }), false);
    assert.deepEqual(
      findOutOfScopePaths(["src/a.js", "docs/b.md"], { allowed_paths: [] }),
      ["src/a.js", "docs/b.md"],
    );
  });
});

describe("evaluateBudget", () => {
  test("passes when usage is within ceilings and fails when exceeded", () => {
    assert.equal(evaluateBudget({ tokens: 1000 }, { tokens: 5000 }).withinBudget, true);
    const over = evaluateBudget({ tokens: 6000 }, { tokens: 5000 });
    assert.equal(over.withinBudget, false);
    assert.match(over.details, /tokens exceeded/);
  });
});

describe("buildEvidenceContract", () => {
  test("builds a schema-valid evidence document and passes gates when in scope and budget", () => {
    const out = buildEvidenceContract(taskExample, {
      sha: VALID_SHA,
      paths: ["src/cli.js", "tests/unit/cli.test.js"],
      additions: 25,
      deletions: 4,
      tests: { total: 10, passed: 10, failed: 0 },
      budgetUsed: { tokens: 120000 },
    });
    assert.equal(out.gates.evidence_collected, true);
    assert.equal(out.gates.within_scope, true);
    assert.equal(out.gates.within_budget, true);
    assert.deepEqual(out.evidence.diff.out_of_scope_paths, []);
    assert.equal(contracts.validate(out.evidence).ok, true);
  });

  test("flags out-of-scope paths and fails within_scope gate while still emitting valid evidence", () => {
    const out = buildEvidenceContract(taskExample, {
      sha: VALID_SHA,
      paths: ["src/cli.js", ".github/workflows/ci.yml"],
    });
    assert.equal(out.gates.within_scope, false);
    assert.deepEqual(out.evidence.diff.out_of_scope_paths, [".github/workflows/ci.yml"]);
    assert.equal(
      out.evidence.policy_results.find((p) => p.policy === "scope.paths").outcome,
      "fail",
    );
    assert.equal(contracts.validate(out.evidence).ok, true);
  });
});
describe("review-domain evidence reporting", () => {
  test("deduplicates paths and retains complete checklists and roles", async () => {
    const { evaluateReviewDomains } = await import("../../src/evidence.js");
    const { loadReviewDomains } = await import("../../src/review-domains.js");
    const doc = loadReviewDomains();
    const result = evaluateReviewDomains(["src/cli.js", "src/cli.js", "notes/a.txt"], doc);
    assert.deepEqual(result.covered[0].paths, ["src/cli.js"]);
    assert.deepEqual(result.covered[0].checks, doc.domains[0].checks);
    assert.deepEqual(result.required_roles, ["reviewer"]);
    assert.deepEqual(result.required_security_roles, []);
    assert.deepEqual(result.uncovered, ["notes/a.txt"]);
  });

  test("handles empty paths and rejects malformed paths or domain documents", async () => {
    const { evaluateReviewDomains } = await import("../../src/evidence.js");
    assert.deepEqual(evaluateReviewDomains(), {
      covered: [], uncovered: [], required_roles: [], required_security_roles: [],
    });
    for (const paths of [null, "src/cli.js", {}, ["/etc/passwd"], ["src/../a"], [null]]) {
      assert.throws(() => evaluateReviewDomains(paths), TypeError);
      assert.throws(() => buildEvidenceContract(taskExample, { sha: VALID_SHA, paths }), TypeError);
    }
    assert.throws(() => evaluateReviewDomains([], { domains: [] }), /schema_version/);
  });

  test("reports injected security requirements without activating firmware or adding gates", async () => {
    const { loadReviewDomains } = await import("../../src/review-domains.js");
    const doc = loadReviewDomains();
    doc.domains.find((d) => d.id === "firmware").enabled = true;
    const task = structuredClone(taskExample);
    task.scope.allowed_paths = ["firmware/**", "notes/**"];
    const result = buildEvidenceContract(task, {
      sha: VALID_SHA, paths: ["firmware/src/lib.rs", "notes/a.txt"], reviewDomains: doc,
    });
    assert.deepEqual(result.review_domains.required_security_roles, ["security_auditor"]);
    assert.deepEqual(result.gates, { evidence_collected: true, within_scope: true, within_budget: true });
    const policy = result.evidence.policy_results.find((p) => p.policy === "review.domains");
    assert.equal(policy.outcome, "warn");
    assert.match(policy.details, /notes\/a.txt/);
    assert.match(policy.details, /security_auditor/);
    assert.equal(contracts.validate(result.evidence).ok, true);
    assert.equal(Object.hasOwn(result.evidence, "review_domains"), false);
    assert.equal(loadReviewDomains().domains.find((d) => d.id === "firmware").enabled, false);
  });

  test("records skipped or pass mapping outcomes independently of scope and budget", () => {
    for (const [paths, expected] of [[[], "skipped"], [["src/cli.js"], "pass"]]) {
      const result = buildEvidenceContract(taskExample, { sha: VALID_SHA, paths, budgetUsed: { tokens: 600000 } });
      assert.equal(result.evidence.policy_results.find((p) => p.policy === "review.domains").outcome, expected);
      assert.equal(result.gates.within_budget, false);
      assert.equal(contracts.validate(result.evidence).ok, true);
    }
  });
});
