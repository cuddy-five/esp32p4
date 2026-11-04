import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import { evaluateTransition, IMPLEMENTED_GATES } from "../../src/lib/gates.js";
import { parseApprovalComments } from "../../src/lib/approval-comments.js";
import { main } from "../../src/cli.js";

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
  assert.match(gate(run(medium), "reviews_approve").reason, /no security review/);
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
