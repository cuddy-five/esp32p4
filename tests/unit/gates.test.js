import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import { evaluateTransition, IMPLEMENTED_GATES } from "../../src/lib/gates.js";
import { parseApprovalComments } from "../../src/lib/approval-comments.js";
import { main } from "../../src/cli.js";
import { discoverTask, RECORDS_ROOT } from "../../src/lib/task-records.js";

const root = fileURLToPath(new URL("../..", import.meta.url));
const example = (kind) => JSON.parse(fs.readFileSync(path.join(root, `.github/control-plane/contracts/examples/${kind}.example.json`), "utf8"));
const HEAD = "0123456789abcdef0123456789abcdef01234567";
const NEW_HEAD = "1111111111111111111111111111111111111111";
const NOW = Date.parse("2026-10-12T02:00:00Z");

/** A complete low-risk packet that should pass the merge decision gates. */
function packet() {
  const task = example("task");
  const plan = example("plan");
  const planReview = {
    ...example("review"),
    id: "review_plan_0001",
    created_at: "2026-10-12T00:10:00Z",
    producer: { kind: "agent", name: "plan-reviewer", role: "reviewer" },
    review_kind: "plan",
    evidence_id: undefined,
  };
  delete planReview.evidence_id;
  const verifierEvidence = {
    ...example("evidence"),
    id: "evidence_verifier_0001",
    created_at: "2026-10-12T01:00:00Z",
    producer: { kind: "agent", name: "verifier", role: "verifier" },
    budget_used: { tokens: 10000 },
  };
  const verification = {
    ...example("review"),
    id: "review_verify_0001",
    created_at: "2026-10-12T01:05:00Z",
    producer: { kind: "agent", name: "verifier", role: "verifier" },
    review_kind: "verification",
    evidence_id: verifierEvidence.id,
    budget_used: { tokens: 1000 },
  };
  return [task, plan, planReview, example("handoff"), example("evidence"), example("review"), verifierEvidence, verification];
}

const approval = (over = {}) => ({
  stage: "merge",
  task_id: example("task").id,
  plan_id: example("plan").id,
  approver: "owner",
  granted_at: "2026-10-12T01:30:00Z",
  sha: HEAD,
  reference: "https://github.com/o/r/pull/1#issuecomment-1",
  authenticated: true,
  ...over,
});

function run(docs, over = {}) {
  return evaluateTransition(docs, { headSha: HEAD, approvals: [approval()], overseers: ["owner"], now: NOW, ...over });
}
const gate = (report, name) => report.gates.find((g) => g.gate === name);

test("a complete packet passes every merge-decision gate", () => {
  const report = run(packet());
  assert.equal(report.ok, true, JSON.stringify(report.gates, null, 2));
  assert.equal(report.transition, "awaiting_approval -> done");
  assert.match(report.authority, /not the person/);
});

test("missing, stale, expired or foreign approval cannot advance", () => {
  assert.match(gate(run(packet(), { approvals: [] }), "approval_granted").reason, /no merge approval record/);
  const cases = [
    [approval({ sha: NEW_HEAD }), /head is/],
    [approval({ granted_at: "2026-10-08T00:00:00Z" }), /expired/],
    [approval({ approver: "implementer" }), /not an overseer/],
    [approval({ plan_id: "plan_superseded_01" }), /not current/],
    [approval({ stage: "plan" }), /stage plan/],
    [approval({ authenticated: undefined }), /not read from GitHub/],
  ];
  for (const [record, why] of cases) {
    const r = run(packet(), { approvals: [record] });
    assert.equal(r.ok, false);
    assert.match(gate(r, "approval_granted").reason, why);
  }
  assert.match(gate(run(packet(), { overseers: [] }), "approval_granted").reason, /no overseer/);
});

test("evidence and reviews for an older commit are stale", () => {
  const r = run(packet(), { headSha: NEW_HEAD, approvals: [approval({ sha: NEW_HEAD })] });
  assert.equal(r.ok, false);
  assert.match(gate(r, "evidence_collected").reason, /stale/);
  assert.match(gate(r, "reviews_approve").reason, /stale/);
  assert.match(gate(r, "verification_passed").reason, /no verifier evidence/);
});

test("self-review fails for plans, code and verification", () => {
  const docs = packet();
  docs.find((d) => d.review_kind === "code").producer = { kind: "agent", name: "implementer", role: "reviewer" };
  assert.match(gate(run(docs), "reviews_approve").reason, /self-review/);

  const planSelf = packet();
  planSelf.find((d) => d.review_kind === "plan").producer = { kind: "agent", name: "planner", role: "reviewer" };
  assert.match(gate(run(planSelf), "plan_reviewed").reason, /self-review/);

  const verifySelf = packet();
  verifySelf.find((d) => d.id === "evidence_verifier_0001").producer = { kind: "agent", name: "Implementer", role: "verifier" };
  assert.match(gate(run(verifySelf), "verification_passed").reason, /produced by implementer/);
});

test("out-of-scope work fails whether paths come from git or evidence", () => {
  const fromGit = run(packet(), { changedPaths: ["src/cli.js", ".github/workflows/ci.yml"] });
  assert.equal(fromGit.ok, false);
  assert.match(gate(fromGit, "within_scope").reason, /\.github\/workflows\/ci\.yml/);
  const docs = packet();
  docs.find((d) => d.id === "evidence_verifier_0001").diff.paths.push("secrets/key.txt");
  assert.match(gate(run(docs), "within_scope").reason, /secrets\/key\.txt/);
});

test("other blockers: open escalation, failing verification, security review at medium risk", () => {
  const esc = { ...example("escalation"), status: "open", severity: "high" };
  delete esc.resolution;
  const blocked = run([...packet(), esc]);
  assert.equal(gate(blocked, "no_open_escalation").pass, false);
  assert.match(gate(blocked, "approval_granted").reason, /invalidated/);

  const red = packet();
  red.find((d) => d.id === "evidence_verifier_0001").checks[0].conclusion = "failure";
  assert.match(gate(run(red), "verification_passed").reason, /not green/);

  const medium = packet();
  medium[0].risk.level = "medium";
  assert.match(gate(run(medium), "reviews_approve").reason, /no security review \(required by medium risk\)/);
});

test("a review domain that names the security auditor requires a security review at low risk", () => {
  const domains = (over = {}) => ({
    schema_version: 1,
    domains: [{
      id: "signing", enabled: true, language: "javascript", role: "reviewer", security_role: "security_auditor",
      paths: ["src/lib/settings/**"], checks: ["Signing code needs a security audit before merge."], ...over,
    }],
  });
  const reason = (docs, doc, over = {}) => gate(run(docs, { reviewDomains: doc, ...over }), "reviews_approve");
  assert.match(reason(packet(), domains()).reason, /no security review \(required by review domain signing\)/);
  assert.equal(reason(packet(), domains({ enabled: false })).pass, true, "a disabled domain requires nothing");
  assert.equal(reason(packet(), domains({ paths: ["firmware/**"] })).pass, true, "an unmatched domain requires nothing");
  assert.equal(reason(packet(), domains(), { changedPaths: ["docs/x.md"] }).pass, true, "git paths replace evidence paths");
  assert.match(reason(packet(), domains(), { changedPaths: ["src/lib/settings/a.js"] }).reason, /review domain signing/);

  const audit = {
    ...example("review"), id: "review_security_0001", created_at: "2026-10-12T00:58:00Z",
    producer: { kind: "agent", name: "auditor", role: "security_auditor" }, review_kind: "security",
  };
  assert.equal(reason([...packet(), audit], domains()).pass, true);
  const byImplementer = { ...audit, producer: { kind: "agent", name: "implementer", role: "security_auditor" } };
  assert.match(reason([...packet(), byImplementer], domains()).reason, /self-review/);
  // The repository's own file is the default; its firmware domain is off until firmware/ exists.
  assert.equal(reason(packet(), undefined, { changedPaths: ["firmware/src/main.rs"] }).pass, true);
});

test("plan routing sends ci_cd work to the human and ordinary work straight on", () => {
  const toHuman = run(packet(), { from: "planning", to: "awaiting_approval" });
  assert.equal(toHuman.ok, true, JSON.stringify(toHuman.gates));
  assert.match(gate(toHuman, "approval_required").reason, /ci_infrastructure_and_spending/);
  assert.equal(run(packet(), { from: "planning", to: "in_progress" }).ok, false);
  const ordinary = packet();
  ordinary[0].risk.tags = [];
  assert.equal(run(ordinary, { from: "planning", to: "in_progress" }).ok, true);
  assert.match(gate(run(ordinary, { from: "planning", to: "in_progress", changedPaths: ["AGENTS.md"] }), "approval_not_required").reason, /instructions_and_ownership/);
});

test("review fix: evidence without a complete path list cannot prove scope", () => {
  const noDiff = packet();
  for (const d of noDiff) if (d.contract === "evidence") delete d.diff;
  assert.match(gate(run(noDiff), "within_scope").reason, /no head evidence lists diff\.paths/);
  const partial = packet();
  for (const d of partial) if (d.contract === "evidence") d.diff = { files_changed: 7, additions: 1, deletions: 0, paths: ["src/cli.js"] };
  assert.match(gate(run(partial), "within_scope").reason, /fewer paths than files_changed/);
  assert.equal(gate(run(noDiff, { changedPaths: ["src/cli.js"] }), "within_scope").pass, true);
});

test("review fix: verification needs a passing check or test", () => {
  for (const tests of [{ total: 0, passed: 0, failed: 0 }, { total: 10, passed: 0, failed: 0, skipped: 10 }]) {
    const docs = packet();
    Object.assign(docs.find((d) => d.id === "evidence_verifier_0001"), { checks: [], tests });
    assert.match(gate(run(docs), "verification_passed").reason, /no passing check or test/);
  }
});

test("review fix: plan files and git paths both route to the human", () => {
  const docs = packet();
  docs[0].risk.tags = [];
  docs[1].steps[0].files_touched = [".github/control-plane/policies/approvals.yaml"];
  for (const changedPaths of [[], ["src/a.js"], undefined]) {
    const r = run(docs, { from: "planning", to: "in_progress", changedPaths });
    assert.match(gate(r, "approval_not_required").reason, /control_plane_self/);
  }
  const unlisted = packet();
  unlisted[0].risk.tags = [];
  for (const step of unlisted[1].steps) delete step.files_touched;
  const r = run(unlisted, { from: "planning", to: "in_progress" });
  assert.match(gate(r, "approval_not_required").reason, /s1, s2 list no files_touched/);
});

test("review fix: an unidentified implementer fails the self-review checks", () => {
  const docs = packet().filter((d) => d.contract !== "handoff");
  docs.find((d) => d.review_kind === "code").producer = { kind: "agent", name: "implementer", role: "reviewer" };
  const r = run(docs);
  assert.equal(r.ok, false);
  assert.match(gate(r, "reviews_approve").reason, /no implementer/);
  assert.match(gate(r, "verification_passed").reason, /no implementer/);
});

test("invalid, mixed or ambiguous packets are rejected", () => {
  assert.throws(() => run([{ contract: "task" }]), /invalid documents/);
  const foreign = packet();
  foreign[5] = { ...foreign[5], task_id: "task_other_0001" };
  assert.throws(() => run(foreign), /another task/);
  assert.throws(() => run(packet(), { headSha: "abc" }), /40 lowercase hex/);
  assert.throws(() => run(packet(), { from: "done", to: "proposed" }), /no transition/);
  const twoPlans = packet();
  twoPlans.push({ ...example("plan"), id: "plan_competing_0001" });
  assert.match(gate(run(twoPlans), "plan_valid").reason, /competing/);
});

test("state-machine.yaml marks exactly the evaluated gates implemented", () => {
  const sm = YAML.parse(fs.readFileSync(path.join(root, ".github/control-plane/orchestration/state-machine.yaml"), "utf8"));
  const marked = Object.entries(sm.gates).filter(([, g]) => g.status === "implemented").map(([name]) => name).sort();
  assert.deepEqual(marked, [...IMPLEMENTED_GATES].sort());
});

/** A PR conversation comment in the GitHub REST shape. */
const comment = (body, over = {}) => ({
  id: 7,
  html_url: "https://github.com/o/r/pull/24#issuecomment-7",
  body,
  user: { login: "cuddy-five", type: "User" },
  created_at: "2026-10-12T01:30:00Z",
  updated_at: "2026-10-12T01:30:00Z",
  performed_via_github_app: null,
  ...over,
});
const APPROVE = `/approve merge task=${example("task").id} plan=${example("plan").id} sha=${HEAD}`;

test("approval comments: GitHub supplies approver and time; edited, app, bot and malformed lines are ignored", () => {
  const { approvals, ignored } = parseApprovalComments([
    comment(`Looks right.\n${APPROVE}\n`),
    comment(`> ${APPROVE}`),
    comment(APPROVE, { updated_at: "2026-10-12T01:31:00Z", html_url: "edited" }),
    comment(APPROVE, { performed_via_github_app: { slug: "copilot" }, html_url: "app" }),
    comment(APPROVE, { user: { login: "ci[bot]", type: "Bot" }, html_url: "bot" }),
    comment(`/approve merge task=${example("task").id} plan=${example("plan").id}`, { html_url: "nosha" }),
  ]);
  assert.equal(approvals.length, 1);
  assert.deepEqual(
    { ...approvals[0] },
    { stage: "merge", task_id: example("task").id, plan_id: example("plan").id, sha: HEAD, approver: "cuddy-five", granted_at: "2026-10-12T01:30:00Z", reference: comment("").html_url, authenticated: true },
  );
  assert.deepEqual(ignored.map((w) => w.split(":")[0]), ["edited", "app", "bot", "nosha"]);
});

/** A fake GitHub client serving one pull request and its comments. */
const fakeGitHub = (comments, headSha = HEAD) => ({
  request: async (method, p) => {
    assert.equal(`${method} ${p}`, "GET /repos/o/r/pulls/24");
    return { data: { head: { sha: headSha } } };
  },
  paginate: async (p) => {
    assert.equal(p, "/repos/o/r/issues/24/comments");
    return comments;
  },
});

test("gate check CLI reads approvals from PR comments by policy overseers", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gate-cli-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const files = packet().map((doc, i) => {
    const file = path.join(dir, `${i}.json`);
    fs.writeFileSync(file, JSON.stringify(doc));
    return file;
  });
  const out = [];
  const io = (client) => ({ stdout: (s) => out.push(s), stderr: (s) => out.push(s), env: {}, client });
  const args = ["gate", "check", ...files, "--head-sha", HEAD, "--now", "2026-10-12T02:00:00Z"];
  const withPr = [...args, "--pr", "24", "--repo", "o/r"];

  assert.equal(await main(withPr, io(fakeGitHub([comment(APPROVE)]))), 0, out.join("\n"));
  assert.match(out[0], /^PASS awaiting_approval -> done/);
  assert.match(out.join("\n"), /merge approval by cuddy-five .*issuecomment-7/);

  for (const [client, why] of [
    [undefined, /no merge approval record/],
    [fakeGitHub([comment(APPROVE, { user: { login: "implementer", type: "User" } })]), /implementer is not an overseer/],
    [fakeGitHub([comment(APPROVE, { updated_at: "2026-10-12T01:40:00Z" })]), /ignored .*edited after posting/],
  ]) {
    out.length = 0;
    assert.equal(await main(client ? withPr : args, io(client)), 2, out.join("\n"));
    assert.match(out.join("\n"), why);
  }

  out.length = 0;
  assert.equal(await main(withPr, io(fakeGitHub([comment(APPROVE)], NEW_HEAD))), 1);
  assert.match(out.join("\n"), /is not the head of PR #24/);
  assert.equal(await main([...args, "--pr", "0"], io()), 1);
  assert.equal(await main([...args, "--format", "yaml"], io()), 1);
});

/** A git repo: base, a code commit (the subject), then a records-only commit at the PR head. */
function recordsRepo(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gate-records-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const g = (...args) => execFileSync("git", args, { cwd: dir, encoding: "utf8" }).trim();
  for (const args of [["init", "-q"], ["config", "user.email", "fixture@example.invalid"], ["config", "user.name", "fixture"], ["config", "commit.gpgsign", "false"]]) g(...args);
  const commitFiles = (files, message) => {
    for (const [name, text] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
      fs.writeFileSync(path.join(dir, name), text);
    }
    g("add", "-A");
    g("commit", "-qm", message);
    return g("rev-parse", "HEAD");
  };
  const base = commitFiles({ "README.md": "base\n" }, "base");
  const subject = commitFiles({ "src/a.js": "export {};\n" }, "code");
  const recordsDir = `${RECORDS_ROOT}${example("task").id}/`;
  const records = (sha) => Object.fromEntries(packet().map((doc, i) => [`${recordsDir}${i}.json`, JSON.stringify(doc).replaceAll(HEAD, sha)]));
  const head = commitFiles(records(subject), "records");
  return { dir, g, commitFiles, records, recordsDir, base, subject, head };
}

/** Run the CLI with the fixture repo as the working directory, as CI does. */
async function inRepo(t, dir, args, client) {
  const cwd = process.cwd();
  process.chdir(dir);
  t.after(() => process.chdir(cwd));
  const out = [];
  try {
    const code = await main(["gate", "check", "--discover", ...args], { stdout: (s) => out.push(s), stderr: (s) => out.push(s), env: {}, client });
    return { code, text: out.join("\n") };
  } finally {
    process.chdir(cwd);
  }
}

test("discover: evidence covers the last code commit; the approval names the PR head", async (t) => {
  const r = recordsRepo(t);
  const found = discoverTask(r.base, r.head, (args) => execFileSync("git", args, { cwd: r.dir }));
  assert.equal(found.subject, r.subject);
  assert.deepEqual(found.paths, ["src/a.js"]);
  assert.equal(found.docs.length, packet().length);

  const approve = (sha) => fakeGitHub([comment(`/approve merge task=${example("task").id} plan=${example("plan").id} sha=${sha}`)], r.head);
  const args = ["--base", r.base, "--head-sha", r.head, "--pr", "24", "--repo", "o/r", "--now", "2026-10-12T02:00:00Z"];
  let res = await inRepo(t, r.dir, args, approve(r.head));
  assert.equal(res.code, 0, res.text);
  assert.match(res.text, new RegExp(`at ${r.subject} \\(records-only commits up to ${r.head}\\)`));
  assert.match(res.text, /within_scope: 1 changed paths within task scope \(from git\)/);

  res = await inRepo(t, r.dir, args, approve(r.subject));
  assert.equal(res.code, 2, res.text);
  assert.match(res.text, /approves [0-9a-f]{12}, head is/);
  assert.match(res.text, new RegExp(`Overseer approval line: /approve merge task=\\S+ plan=\\S+ sha=${r.head}`));
});

test("discover: a code change after the records makes them stale; a scope breach still fails", async (t) => {
  const r = recordsRepo(t);
  const later = r.commitFiles({ "src/b.js": "export {};\n" }, "more code");
  const client = fakeGitHub([comment(`/approve merge task=${example("task").id} plan=${example("plan").id} sha=${later}`)], later);
  const args = ["--base", r.base, "--head-sha", later, "--pr", "24", "--repo", "o/r", "--now", "2026-10-12T02:00:00Z"];
  let res = await inRepo(t, r.dir, args, client);
  assert.equal(res.code, 2, res.text);
  assert.match(res.text, /evidence is stale/);

  r.commitFiles({ ".github/workflows/x.yml": "on: push\n" }, "forbidden");
  const head = r.commitFiles(r.records(r.g("rev-parse", "HEAD")), "refresh records");
  res = await inRepo(t, r.dir, ["--base", r.base, "--head-sha", head], undefined);
  assert.equal(res.code, 2, res.text);
  assert.match(res.text, /out of scope: \.github\/workflows\/x\.yml/);
});

test("discover: an empty-diff merge of the base is the subject, so its effect cannot hide", async (t) => {
  const r = recordsRepo(t);
  // The base branch moves on with a fix; the PR merges it with -s ours (reverting
  // the fix in the merge result) and then refreshes its records.
  r.g("checkout", "-q", "-b", "pr");
  r.g("checkout", "-q", r.base);
  const fixed = r.commitFiles({ "README.md": "fixed\n" }, "fix on base");
  r.g("checkout", "-q", "pr");
  r.g("merge", "-q", "-s", "ours", "--no-edit", fixed);
  const merge = r.g("rev-parse", "HEAD");
  // Same records, reformatted, so the commit touches only the records directory.
  const pretty = Object.fromEntries(Object.entries(r.records(r.subject)).map(([f, text]) => [f, JSON.stringify(JSON.parse(text), null, 2)]));
  const head = r.commitFiles(pretty, "records after merge");
  const found = discoverTask(fixed, head, (args) => execFileSync("git", args, { cwd: r.dir }));
  assert.equal(found.subject, merge);
  assert.ok(found.paths.includes("README.md"), found.paths.join(", "));
  const res = await inRepo(t, r.dir, ["--base", fixed, "--head-sha", head]);
  assert.equal(res.code, 2, res.text);
  assert.match(res.text, /evidence is stale/);
});

test("discover: no records skips; malformed, mixed or misnamed records are errors", async (t) => {
  const r = recordsRepo(t);
  let res = await inRepo(t, r.dir, ["--base", r.base, "--head-sha", r.subject]);
  assert.equal(res.code, 0, res.text);
  assert.match(res.text, /^SKIP no task records/);

  for (const [files, why] of [
    [{ [`${RECORDS_ROOT}README.md`]: "x\n" }, /records must be/],
    [{ [`${RECORDS_ROOT}task_other_0001/0.json`]: "{}\n" }, /one task per pull request/],
    [{ [`${r.recordsDir}notes.txt`]: "x\n" }, /must be|not a \.json record/],
    [{ [`${r.recordsDir}0.json`]: "{" }, /not valid JSON/],
  ]) {
    const head = r.commitFiles(files, "bad records");
    res = await inRepo(t, r.dir, ["--base", r.base, "--head-sha", head]);
    assert.equal(res.code, 1, res.text);
    assert.match(res.text, why);
    r.g("reset", "-q", "--hard", r.head);
  }

  const misnamed = r.commitFiles({ [`${RECORDS_ROOT}task_misnamed_0001/0.json`]: JSON.stringify(example("task")) }, "misnamed");
  res = await inRepo(t, r.dir, ["--base", r.head, "--head-sha", misnamed]);
  assert.equal(res.code, 1, res.text);
  assert.match(res.text, /must be named after the task id/);
  assert.equal((await inRepo(t, r.dir, ["--head-sha", r.head, "x.json"])).code, 1);
});
