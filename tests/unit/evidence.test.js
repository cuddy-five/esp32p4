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