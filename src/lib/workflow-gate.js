/* Informational workflow report. A declaration is not authenticated authority. */
import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { ContractRegistry } from "./contracts.js";
import { loadApprovals, requiredHumanStages } from "./orchestration.js";
import { findOutOfScopePaths } from "../evidence.js";

function git(args) {
  const result = spawnSync("git", args, { maxBuffer: 32 * 1024 * 1024 });
  if (result.error || result.status !== 0) throw new Error("Git comparison failed or commit is unavailable.");
  return result.stdout;
}

function commit(ref, requireSha, runGit) {
  if (!ref || (requireSha && !/^[0-9a-f]{40}$/.test(ref))) throw new Error("Missing or invalid PR commit SHA.");
  const sha = runGit(["rev-parse", "--verify", "--end-of-options", `${ref}^{commit}`]).toString("ascii").trim();
  if (!/^[0-9a-f]{40}$/.test(sha) || (requireSha && sha !== ref)) throw new Error("Commit is unavailable.");
  return sha;
}

function changedPaths(base, head, runGit) {
  const bytes = runGit(["diff", "--no-renames", "--name-only", "-z", base, head, "--"]);
  if (bytes.length && bytes.at(-1) !== 0) throw new Error("Incomplete Git path output.");
  const paths = [];
  const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
  let start = 0;
  for (let i = 0; i < bytes.length; i++) {
    if (bytes[i] === 0) {
      try { paths.push(decoder.decode(bytes.subarray(start, i))); }
      catch { throw new Error("Git diff contains a non-UTF-8 path; comparison cannot be completed."); }
      start = i + 1;
    }
  }
  return paths;
}

export function buildReport(env = process.env, runGit = git) {
  const pr = env.CP_EVENT === "pull_request";
  if (!pr && env.CP_EVENT !== "workflow_dispatch") throw new Error("Unsupported workflow event.");
  const base = commit(pr ? env.CP_BASE_SHA : env.CP_BASE_REF, pr, runGit);
  const head = commit(pr ? env.CP_HEAD_SHA : env.CP_HEAD_REF, pr, runGit);
  const paths = changedPaths(base, head, runGit);
  let scope = "UNKNOWN";
  let stages = null;
  let outOfScope = [];
  // PR events cannot supply a task and must never infer one from PR-controlled data.
  if (!pr && env.CP_TASK_FILE) {
    let task;
    try { task = JSON.parse(fs.readFileSync(env.CP_TASK_FILE, "utf8")); }
    catch { throw new Error("Task declaration is unreadable or invalid JSON."); }
    const validation = new ContractRegistry().validate(task, { kind: "task" });
    if (!validation.ok || task.contract !== "task") throw new Error("Task declaration is invalid.");
    const { doc, problems } = loadApprovals();
    if (problems.length) throw new Error("Approval policy is invalid.");
    outOfScope = findOutOfScopePaths(paths, task.scope);
    scope = outOfScope.length ? "FAIL" : "PASS";
    stages = requiredHumanStages(doc, { risk: task.risk, paths });
  }
  return { event: env.CP_EVENT, base, head, paths, scope, outOfScope, stages };
}

export function renderReport(report) {
  const stages = report.stages ? report.stages.stages.join(", ") || "none" : "UNKNOWN";
  return [
    "### Informational comparison (not an admission gate)", "",
    `- Base commit: \`${report.base}\``,
    `- Subject head commit: \`${report.head}\``,
    `- Changed paths: ${report.paths.length}`,
    `- Scope against supplied declaration: **${report.scope}**`,
    `- Human approval stages from supplied declaration: **${stages}**`, "",
    "A successful status only means this report ran, even if required by branch protection.",
    "Task provenance, connection to a PR, completed reviews, human approval, and merge permission are not verified. Human oversight remains required.",
    "",
  ].join("\n");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const report = buildReport();
    const text = renderReport(report);
    if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, text);
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } catch (error) {
    console.error(`workflow-gate: ${error.message}`);
    process.exitCode = 1;
  }
}
