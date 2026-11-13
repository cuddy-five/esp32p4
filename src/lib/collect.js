/*
 * Collect evidence facts instead of accepting them as typed claims.
 *
 * Two facts come from here. The diff comes from git: the changed paths and line
 * counts between a base and the commit under review. The checks come from
 * running them: each command runs in a checkout whose files equal that commit,
 * and its real exit status is recorded.
 *
 * A check that ran on other files proves nothing about the commit, so the
 * checkout is compared with the commit first. The task's own records directory
 * is left out of that comparison and of the diff, because records describe a
 * commit and so arrive after it (see task-records.js).
 */
import { spawnSync } from "node:child_process";
import { git } from "./workflow-gate.js";
import { RECORDS_ROOT } from "./task-records.js";

/** The directory that holds one task's records, with its trailing slash. */
export const recordsDirFor = (taskId) => `${RECORDS_ROOT}${taskId}/`;

/** Split NUL-terminated git output into strings; refuse a path that is not UTF-8. */
function nulFields(bytes) {
  if (bytes.length && bytes.at(-1) !== 0) throw new Error("Incomplete Git path output.");
  const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
  const fields = [];
  let start = 0;
  for (let i = 0; i < bytes.length; i += 1) {
    if (bytes[i] !== 0) continue;
    try {
      fields.push(decoder.decode(bytes.subarray(start, i)));
    } catch {
      throw new Error("Git output contains a non-UTF-8 path; it cannot be recorded.");
    }
    start = i + 1;
  }
  return fields;
}

/**
 * Changed files and line counts from the merge base of `base` and `head` to
 * `head`. A binary file counts as changed with no lines.
 * @param {string} base commit the change is compared with
 * @param {string} head commit under review
 * @param {{ exclude?: string, runGit?: (args: string[]) => Buffer }} [opts]
 *   exclude: a directory prefix to leave out (the task's records)
 * @returns {{ baseSha: string, paths: string[], additions: number, deletions: number }}
 */
export function diffStat(base, head, { exclude, runGit = git } = {}) {
  const baseSha = runGit(["merge-base", base, head]).toString("ascii").trim();
  if (!/^[0-9a-f]{40}$/.test(baseSha)) throw new Error("Git reported no merge base.");
  const rows = nulFields(runGit(["diff", "--numstat", "--no-renames", "-z", baseSha, head, "--"]));
  const paths = [];
  let additions = 0;
  let deletions = 0;
  for (const row of rows) {
    // "<added>\t<deleted>\t<path>"; the path may itself contain tabs.
    const m = /^(\d+|-)\t(\d+|-)\t([\s\S]+)$/.exec(row);
    if (!m) throw new Error("Unexpected Git numstat output.");
    if (exclude && m[3].startsWith(exclude)) continue;
    paths.push(m[3]);
    additions += m[1] === "-" ? 0 : Number(m[1]);
    deletions += m[2] === "-" ? 0 : Number(m[2]);
  }
  return { baseSha, paths, additions, deletions };
}

/**
 * Why the working tree is not the commit `sha`, as plain sentences; empty when
 * it is. Files under `exclude` are not compared.
 * @param {string} sha
 * @param {{ exclude?: string, runGit?: (args: string[]) => Buffer }} [opts]
 * @returns {string[]}
 */
export function snapshotProblems(sha, { exclude, runGit = git } = {}) {
  const outside = (p) => !exclude || !p.startsWith(exclude);
  const list = (names) => {
    const shown = names.slice(0, 5).join(", ");
    return names.length > 5 ? `${shown} and ${names.length - 5} more` : shown;
  };
  const problems = [];
  const differing = nulFields(runGit(["diff", "--name-only", "--no-renames", "-z", sha, "--"])).filter(outside);
  if (differing.length) problems.push(`${differing.length} tracked file${differing.length === 1 ? " differs" : "s differ"} from ${sha.slice(0, 12)}: ${list(differing)}`);
  const untracked = nulFields(runGit(["ls-files", "--others", "--exclude-standard", "--full-name", "-z", "--", ":/"])).filter(outside);
  if (untracked.length) problems.push(`${untracked.length} untracked file${untracked.length === 1 ? "" : "s"}: ${list(untracked)}`);
  return problems;
}

/**
 * Run each command through `sh -c` in `cwd` and record what happened. Every
 * command runs even after one fails, so the evidence lists each result.
 * @param {string[]} commands
 * @param {{ cwd: string, timeoutMs: number, spawn?: typeof spawnSync, clock?: () => number }} opts
 * @returns {{ check: { name: string, conclusion: "success" | "failure" | "timed_out", duration_seconds: number, required: true }, output: string }[]}
 */
export function runChecks(commands, { cwd, timeoutMs, spawn = spawnSync, clock = Date.now }) {
  return commands.map((command) => {
    const started = clock();
    const r = spawn("sh", ["-c", command], {
      cwd,
      timeout: timeoutMs,
      killSignal: "SIGKILL",
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const seconds = Math.max(0, Math.round((clock() - started) / 100) / 10);
    const timedOut = r.error?.code === "ETIMEDOUT";
    const conclusion = timedOut ? "timed_out" : r.status === 0 && !r.error ? "success" : "failure";
    const note = r.error && !timedOut ? `\n(could not finish: ${r.error.message})` : "";
    return {
      check: { name: command, conclusion, duration_seconds: seconds, required: true },
      output: `${r.stdout ?? ""}${r.stderr ?? ""}${note}`,
    };
  });
}
