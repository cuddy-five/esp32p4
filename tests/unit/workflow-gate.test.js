import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import { buildReport, renderReport } from "../../src/lib/workflow-gate.js";

const root = fileURLToPath(new URL("../..", import.meta.url));
const script = path.join(root, "src/lib/workflow-gate.js");
const taskExample = path.join(root, ".github/control-plane/contracts/examples/task.example.json");
test("informational report handles exact NUL-separated paths and rejects non-UTF-8", () => {
  const base = "a".repeat(40);
  const head = "b".repeat(40);
  const env = { CP_EVENT: "pull_request", CP_BASE_SHA: base, CP_HEAD_SHA: head };
  const mock = (args) => args[0] === "rev-parse"
    ? Buffer.from(`${args.at(-1).slice(0, 40)}\n`)
    : Buffer.from("deleted\0old name\0new\nname\0");
  const report = buildReport(env, mock);
  assert.deepEqual(report.paths, ["deleted", "old name", "new\nname"]);
  assert.equal(report.scope, "UNKNOWN");
  assert.match(renderReport(report), /only means this report ran/);
  assert.throws(() => buildReport(env, (args) => args[0] === "diff" ? Buffer.from([255, 0]) : mock(args)), /non-UTF-8/);
});
test("manual declaration applies scope and tag-derived stages without claiming authority", (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gate-task-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const task = JSON.parse(fs.readFileSync(taskExample, "utf8"));
  task.scope.allowed_paths = ["**"];
  task.scope.forbidden_paths = ["deleted"];
  task.risk.level = "low";
  task.risk.tags = ["auth"];
  const taskFile = path.join(dir, "task.json");
  fs.writeFileSync(taskFile, JSON.stringify(task));
  const sha = "a".repeat(40);
  const mock = (args) => args[0] === "diff" ? Buffer.from("deleted\0") : Buffer.from(`${sha}\n`);
  const env = { CP_EVENT: "workflow_dispatch", CP_BASE_REF: "base", CP_HEAD_REF: "head", CP_TASK_FILE: taskFile };
  const report = buildReport(env, mock);
  assert.equal(report.scope, "FAIL");
  assert.ok(report.stages.stages.includes("plan"));
  assert.match(renderReport(report), /not verified/);
  fs.writeFileSync(taskFile, "{}");
  assert.throws(() => buildReport(env, mock), /invalid/);
});
function run(cmd, args, options = {}) {
  const result = spawnSync(cmd, args, { encoding: "utf8", ...options });
  if (result.error) throw result.error;
  return result;
}
function git(cwd, ...args) {
  const result = run("git", args, { cwd });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}
function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "workflow-gate-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  git(dir, "init", "-q");
  git(dir, "config", "user.email", "fixture@example.invalid");
  git(dir, "config", "user.name", "fixture");
  git(dir, "config", "commit.gpgsign", "false");
  fs.writeFileSync(path.join(dir, "old name"), "unchanged\n");
  fs.writeFileSync(path.join(dir, "deleted"), "delete\n");
  git(dir, "add", ".");
  git(dir, "commit", "-qm", "base");
  const base = git(dir, "rev-parse", "HEAD");
  fs.renameSync(path.join(dir, "old name"), path.join(dir, "new\nname"));
  fs.unlinkSync(path.join(dir, "deleted"));
  git(dir, "add", "-A");
  git(dir, "commit", "-qm", "head");
  const head = git(dir, "rev-parse", "HEAD");
  fs.writeFileSync(path.join(dir, "synthetic"), "synthetic\n");
  git(dir, "add", ".");
  git(dir, "commit", "-qm", "synthetic checkout");
  return { dir, base, head };
}
function invoke(dir, env) {
  return run(process.execPath, [script], { cwd: dir, env: { ...process.env, ...env } });
}

test("PR entry point uses event SHAs, keeps NUL-delimited rename and deletion paths, and reports unknown", (t) => {
  const { dir, base, head } = fixture(t);
  const result = invoke(dir, { CP_EVENT: "pull_request", CP_BASE_SHA: base, CP_HEAD_SHA: head, CP_TASK_FILE: taskExample });
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.base, base);
  assert.equal(report.head, head);
  assert.deepEqual(report.paths.sort(), ["deleted", "new\nname", "old name"].sort());
  assert.equal(report.scope, "UNKNOWN");
  assert.equal(report.stages, null);
  assert.ok(!report.paths.includes("synthetic"));
});

test("manual declaration computes scope, risk and tag stages, and rejects invalid task or commit", (t) => {
  const { dir, base, head } = fixture(t);
  const task = JSON.parse(fs.readFileSync(taskExample, "utf8"));
  task.scope.allowed_paths = ["**"];
  task.scope.forbidden_paths = ["deleted"];
  task.risk.level = "low";
  task.risk.tags = ["auth"];
  const taskFile = path.join(dir, "task.json");
  fs.writeFileSync(taskFile, JSON.stringify(task));
  const env = { CP_EVENT: "workflow_dispatch", CP_BASE_REF: base, CP_HEAD_REF: head, CP_TASK_FILE: taskFile };
  let result = invoke(dir, env);
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.scope, "FAIL");
  assert.ok(report.outOfScope.includes("deleted"));
  assert.ok(report.stages.stages.includes("plan"));
  assert.ok(report.stages.stages.includes("merge"));
  task.risk.level = "high";
  task.risk.tags = [];
  fs.writeFileSync(taskFile, JSON.stringify(task));
  result = invoke(dir, env);
  assert.equal(result.status, 0, result.stderr);
  assert.ok(JSON.parse(result.stdout).stages.stages.includes("plan"));
  fs.writeFileSync(taskFile, "{}");
  assert.notEqual(invoke(dir, env).status, 0);
  assert.notEqual(invoke(dir, { ...env, CP_TASK_FILE: "", CP_HEAD_REF: "missing-ref" }).status, 0);
});

test("workflow wires PR head/base, entry point and removes hosted paid evaluation", () => {
  const gate = YAML.parse(fs.readFileSync(path.join(root, ".github/workflows/merge-gate.yml"), "utf8"));
  const step = gate.jobs["admission-gate"].steps.find((item) => item.run === "node src/lib/workflow-gate.js");
  assert.ok(step);
  assert.match(step.env.CP_BASE_SHA, /pull_request\.base\.sha/);
  assert.match(step.env.CP_HEAD_SHA, /pull_request\.head\.sha/);
  const evals = YAML.parse(fs.readFileSync(path.join(root, ".github/workflows/agent-evals.yml"), "utf8"));
  assert.deepEqual(Object.keys(evals.jobs), ["guardrail-and-registry-audit"]);
});
