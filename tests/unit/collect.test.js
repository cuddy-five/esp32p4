import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { diffStat, recordsDirFor, runChecks, snapshotProblems } from "../../src/lib/collect.js";
import { evaluateTransition } from "../../src/lib/gates.js";
import { main } from "../../src/cli.js";

const root = fileURLToPath(new URL("../..", import.meta.url));
const example = (kind) => JSON.parse(fs.readFileSync(path.join(root, `.github/control-plane/contracts/examples/${kind}.example.json`), "utf8"));
const TASK = example("task");
const RECORDS = recordsDirFor(TASK.id);

/** A git repo with a base commit and one code commit, the commit under review. */
function repo(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "collect-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const g = (...args) => execFileSync("git", args, { cwd: dir, encoding: "utf8" }).trim();
  for (const args of [["init", "-q"], ["config", "user.email", "fixture@example.invalid"], ["config", "user.name", "fixture"], ["config", "commit.gpgsign", "false"]]) g(...args);
  const write = (files) => {
    for (const [name, content] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
      fs.writeFileSync(path.join(dir, name), content);
    }
  };
  const commitFiles = (files, message) => {
    write(files);
    g("add", "-A");
    g("commit", "-qm", message);
    return g("rev-parse", "HEAD");
  };
  const runGit = (args) => execFileSync("git", args, { cwd: dir });
  const base = commitFiles({ "README.md": "one\ntwo\n", "src/old.js": "gone\n", ".gitignore": "target/\n" }, "base");
  fs.rmSync(path.join(dir, "src/old.js"));
  const subject = commitFiles({
    "src/a.js": "export const a = 1;\nexport const b = 2;\n",
    "README.md": "one\nthree\n",
    "docs/pic.bin": Buffer.from([0, 1, 2, 255, 0]),
    "docs/with space.md": "x\n",
  }, "code");
  return { dir, g, write, commitFiles, runGit, base, subject };
}

/** Run the evidence command with the fixture repo as the working directory. */
async function evidence(t, dir, args) {
  const cwd = process.cwd();
  const out = [];
  const err = [];
  process.chdir(dir);
  try {
    const code = await main(["evidence", ...args], { stdout: (s) => out.push(s), stderr: (s) => err.push(s), env: {} });
    return { code, out: out.join("\n"), err: err.join("\n") };
  } finally {
    process.chdir(cwd);
  }
}

test("diffStat reads paths and line counts from git, from the merge base", (t) => {
  const r = repo(t);
  const stat = diffStat(r.base, r.subject, { runGit: r.runGit });
  assert.equal(stat.baseSha, r.base);
  assert.deepEqual([...stat.paths].sort(), ["README.md", "docs/pic.bin", "docs/with space.md", "src/a.js", "src/old.js"]);
  // README +1 -1, a.js +2, old.js -1, "with space.md" +1; the binary file adds no lines.
  assert.equal(stat.additions, 4);
  assert.equal(stat.deletions, 2);

  // The base branch moves on; its commits are not this change's work.
  r.g("checkout", "-q", "-b", "pr");
  r.g("checkout", "-q", r.base);
  const moved = r.commitFiles({ "CHANGELOG.md": "later\n" }, "base moves on");
  const fromMoved = diffStat(moved, r.subject, { runGit: r.runGit });
  assert.equal(fromMoved.baseSha, r.base);
  assert.ok(!fromMoved.paths.includes("CHANGELOG.md"));
});

test("diffStat leaves the task's records out and refuses a non-UTF-8 path", (t) => {
  const r = repo(t);
  const head = r.commitFiles({ [`${RECORDS}task.json`]: "{}\n", "src/b.js": "export {};\n" }, "records and code");
  assert.ok(diffStat(r.base, head, { runGit: r.runGit }).paths.includes(`${RECORDS}task.json`));
  const stat = diffStat(r.base, head, { exclude: RECORDS, runGit: r.runGit });
  assert.ok(stat.paths.includes("src/b.js"));
  assert.ok(!stat.paths.some((p) => p.startsWith(RECORDS)));

  const badPath = (args) => (args[0] === "merge-base" ? Buffer.from(`${r.base}\n`) : Buffer.concat([Buffer.from("1\t0\t"), Buffer.from([0xff, 0xfe]), Buffer.from([0])]));
  assert.throws(() => diffStat(r.base, head, { runGit: badPath }), /non-UTF-8/);
  const cut = (args) => (args[0] === "merge-base" ? Buffer.from(`${r.base}\n`) : Buffer.from("1\t0\tsrc/a.js"));
  assert.throws(() => diffStat(r.base, head, { runGit: cut }), /Incomplete/);
});

test("snapshotProblems accepts only files that equal the commit", (t) => {
  const r = repo(t);
  const check = () => snapshotProblems(r.subject, { exclude: RECORDS, runGit: r.runGit });
  assert.deepEqual(check(), []);

  // Ignored build output and the task's own records do not count.
  r.write({ "target/out.o": "x", [`${RECORDS}review.json`]: "{}\n" });
  assert.deepEqual(check(), []);
  // A records-only commit after the reviewed commit leaves the code the same.
  r.g("add", "-A");
  r.g("commit", "-qm", "records");
  assert.deepEqual(check(), []);

  r.write({ "src/a.js": "export const a = 3;\n" });
  assert.match(check().join(" "), /1 tracked file differs from [0-9a-f]{12}: src\/a\.js/);
  r.g("checkout", "-q", "--", "src/a.js");

  r.write({ "tests/stray.test.js": "x\n" });
  assert.match(check().join(" "), /1 untracked file: tests\/stray\.test\.js/);
  fs.rmSync(path.join(r.dir, "tests"), { recursive: true });

  // A later code commit means the files are no longer the reviewed commit.
  r.commitFiles({ "src/c.js": "export {};\n" }, "more code");
  assert.match(check().join(" "), /src\/c\.js/);
});

test("runChecks records success, failure and a timeout, and runs every command", (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "collect-run-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const results = runChecks(["echo fine", "echo broke >&2; exit 3", "sleep 5", "pwd"], { cwd: dir, timeoutMs: 400 });
  assert.deepEqual(results.map((r) => r.check.conclusion), ["success", "failure", "timed_out", "success"]);
  assert.deepEqual(results.map((r) => r.check.name), ["echo fine", "echo broke >&2; exit 3", "sleep 5", "pwd"]);
  assert.ok(results.every((r) => r.check.required === true && r.check.duration_seconds >= 0));
  assert.match(results[1].output, /broke/);
  assert.equal(fs.realpathSync(results[3].output.trim()), fs.realpathSync(dir));
});

test("evidence --base and --run produce verifier evidence the gate accepts", async (t) => {
  const r = repo(t);
  const open = { ...TASK, scope: { ...TASK.scope, allowed_paths: ["**"], forbidden_paths: [] } };
  const taskFile = path.join(os.tmpdir(), `collect-task-${process.pid}.json`);
  fs.writeFileSync(taskFile, JSON.stringify(open));
  t.after(() => fs.rmSync(taskFile, { force: true }));
  const outFile = path.join(r.dir, RECORDS, "evidence-verify.json");
  fs.mkdirSync(path.dirname(outFile), { recursive: true });

  const res = await evidence(t, r.dir, ["--task", taskFile, "--sha", r.subject, "--base", r.base,
    "--run", "test -f src/a.js", "--run", "git diff --quiet HEAD",
    "--producer-kind", "agent", "--producer-name", "verifier", "--producer-role", "verifier", "--output", outFile]);
  assert.equal(res.code, 0, res.err);
  const envelope = JSON.parse(res.out);
  assert.equal(envelope.gates.checks_passed, true);
  const doc = JSON.parse(fs.readFileSync(outFile, "utf8"));
  assert.deepEqual(doc, envelope.evidence);
  assert.equal(doc.diff.base_sha, r.base);
  assert.equal(doc.diff.files_changed, 5);
  assert.equal(doc.diff.additions, 4);
  assert.equal(doc.diff.deletions, 2);
  assert.deepEqual(doc.checks.map((c) => [c.name, c.conclusion, c.required]), [["test -f src/a.js", "success", true], ["git diff --quiet HEAD", "success", true]]);

  // The same record satisfies the gate that reads verifier evidence.
  const at = (doc2, over) => ({ ...doc2, subject: { ...doc2.subject, sha: r.subject }, ...over });
  const verification = at(example("review"), { id: "review_verify_0001", review_kind: "verification", evidence_id: doc.id, producer: { kind: "agent", name: "verifier", role: "verifier" } });
  const report = evaluateTransition([open, example("plan"), example("handoff"), doc, at(example("review")), verification], {
    headSha: r.subject, overseers: ["owner"], now: Date.parse(doc.created_at) + 1000,
  });
  const gate = (name) => report.gates.find((g) => g.gate === name);
  for (const name of ["verification_passed", "evidence_collected", "within_scope"]) assert.equal(gate(name).pass, true, gate(name).reason);

  // Against the example task's narrower scope the same diff is a breach: exit 2, paths named.
  fs.writeFileSync(taskFile, JSON.stringify(TASK));
  const narrow = await evidence(t, r.dir, ["--task", taskFile, "--sha", r.subject, "--base", r.base]);
  assert.equal(narrow.code, 2);
  assert.deepEqual(JSON.parse(narrow.out).evidence.diff.out_of_scope_paths, ["README.md"]);
});

test("evidence --run refuses a checkout that is not the commit, and reports a failing check", async (t) => {
  const r = repo(t);
  const taskFile = path.join(os.tmpdir(), `collect-task2-${process.pid}.json`);
  fs.writeFileSync(taskFile, JSON.stringify({ ...TASK, scope: { ...TASK.scope, allowed_paths: ["**"], forbidden_paths: [] } }));
  t.after(() => fs.rmSync(taskFile, { force: true }));
  const args = ["--task", taskFile, "--sha", r.subject, "--base", r.base];

  r.write({ "src/a.js": "export const a = 99;\n" });
  let res = await evidence(t, r.dir, [...args, "--run", "true"]);
  assert.equal(res.code, 1);
  assert.match(res.err, /--run refused: the checkout is not commit/);
  assert.match(res.err, /1 tracked file differs/);
  assert.equal(res.out, "", "no evidence is printed for a refused run");
  r.g("checkout", "-q", "--", "src/a.js");

  const outFile = path.join(r.dir, RECORDS, "evidence.json");
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  res = await evidence(t, r.dir, [...args, "--run", "true", "--run", "echo no good; exit 1", "--output", outFile]);
  assert.equal(res.code, 2, res.err);
  assert.match(res.err, /check failed: echo no good; exit 1/);
  assert.match(res.err, /no good/);
  const doc = JSON.parse(fs.readFileSync(outFile, "utf8"));
  assert.deepEqual(doc.checks.map((c) => c.conclusion), ["success", "failure"]);
  assert.equal(JSON.parse(res.out).gates.checks_passed, false);

  res = await evidence(t, r.dir, [...args, "--run", "sleep 5", "--run-timeout", "1"]);
  assert.equal(res.code, 2);
  assert.match(res.err, /timed out after 1 s: sleep 5/);

  // A check that rewrites a tracked file invalidates everything that ran after it.
  res = await evidence(t, r.dir, [...args, "--run", "echo changed > README.md"]);
  assert.equal(res.code, 1);
  assert.match(res.err, /a check changed the checkout/);
  assert.equal(res.out, "");
  r.g("checkout", "-q", "--", "README.md");

  for (const [extra, why] of [
    [["--path", "src/a.js"], /--base reads the diff from git; remove --path/],
    [["--additions", "3", "--base-sha", r.base], /remove --base-sha, --additions/],
    [["--run", "true", "--run-timeout", "0"], /--run-timeout must be a whole number/],
    [["--run", "true", "--run-timeout", "1e3"], /--run-timeout must be a whole number/],
  ]) {
    res = await evidence(t, r.dir, [...args, ...extra]);
    assert.equal(res.code, 1, extra.join(" "));
    assert.match(res.err, why);
  }
  res = await evidence(t, r.dir, ["--task", taskFile, "--sha", "0123456789abcdef0123456789abcdef01234567", "--base", r.base]);
  assert.equal(res.code, 1, "a commit git does not have is an error");
});
