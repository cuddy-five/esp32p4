/*
 * Find a pull request's committed task records and the commit they review.
 *
 * Records live in RECORDS_ROOT/<task_id>/*.json. Evidence and reviews name the
 * commit they cover, and a commit cannot contain its own SHA, so the records
 * that describe commit S arrive in later commits. The subject is therefore the
 * newest first-parent commit that is a merge or changes anything outside the
 * task's records directory; every commit after it is a single-parent commit
 * that touches only that directory. A merge always counts as code: even an
 * empty-diff merge (`git merge -s ours`) moves the merge base.
 *
 * All reads go through git objects, never the working tree, so the caller can
 * run trusted base-branch code over an untrusted PR head.
 */
import { changedPaths, git } from "./workflow-gate.js";

export const RECORDS_ROOT = ".github/control-plane/records/";

const RECORD = /^([^/]+)\/[^/]+\.json$/;

/**
 * The task directories that changed paths touch under RECORDS_ROOT.
 * @param {string[]} paths
 * @returns {{ tasks: string[], malformed: string[] }}
 */
export function recordDirs(paths) {
  const tasks = new Set();
  const malformed = [];
  for (const p of paths) {
    if (!p.startsWith(RECORDS_ROOT)) continue;
    const m = RECORD.exec(p.slice(RECORDS_ROOT.length));
    if (m) tasks.add(m[1]);
    else malformed.push(p);
  }
  return { tasks: [...tasks].sort(), malformed };
}

const inDir = (dir) => (p) => p.startsWith(dir);

/**
 * The newest first-parent commit after the merge base that is a merge or
 * changes anything outside `dir`, or the merge base when there is none.
 */
export function subjectCommit(base, head, dir, runGit = git) {
  const mergeBase = runGit(["merge-base", base, head]).toString("ascii").trim();
  // Each line is "<sha> <parent>..."; more than one parent marks a merge.
  const commits = runGit(["rev-list", "--first-parent", "--parents", `${mergeBase}..${head}`]).toString("ascii").split("\n").filter(Boolean);
  for (const line of commits) {
    const [sha, ...parents] = line.split(" ");
    if (parents.length !== 1 || !changedPaths(`${sha}^`, sha, runGit).every(inDir(dir))) return sha;
  }
  return mergeBase;
}

/** Parse every file in `dir` at commit `head`. Only `.json` files are allowed. */
export function readRecords(head, dir, runGit = git) {
  const names = runGit(["ls-tree", "-r", "-z", "--name-only", head, "--", dir]).toString("utf8").split("\0").filter(Boolean);
  return names.map((name) => {
    if (!name.endsWith(".json")) throw new Error(`${name} is not a .json record`);
    try {
      return JSON.parse(runGit(["show", `${head}:${name}`]).toString("utf8"));
    } catch (error) {
      throw new Error(`${name} is not valid JSON (${error.message})`);
    }
  });
}

/**
 * Locate the one task whose records a PR changes, its subject commit, and the
 * code paths the subject changes (records excluded).
 * @returns {null | { taskId: string, dir: string, subject: string, docs: object[], paths: string[] }}
 *   null when the PR changes no task records.
 */
export function discoverTask(base, head, runGit = git) {
  const { tasks, malformed } = recordDirs(changedPaths(base, head, runGit));
  if (malformed.length) throw new Error(`records must be ${RECORDS_ROOT}<task_id>/<name>.json: ${malformed.join(", ")}`);
  if (!tasks.length) return null;
  if (tasks.length > 1) throw new Error(`one task per pull request; records changed for ${tasks.join(", ")}`);
  const [taskId] = tasks;
  const dir = `${RECORDS_ROOT}${taskId}/`;
  const docs = readRecords(head, dir, runGit);
  const task = docs.find((d) => d?.contract === "task");
  if (task && task.id !== taskId) throw new Error(`${dir} holds task ${task.id}; the directory must be named after the task id`);
  const subject = subjectCommit(base, head, dir, runGit);
  // Diff to the head, not the subject, so the paths start at the merge's real base.
  // The two trees differ only inside `dir`, which is excluded.
  const paths = changedPaths(base, head, runGit).filter((p) => !inDir(dir)(p));
  return { taskId, dir, subject, docs, paths };
}
