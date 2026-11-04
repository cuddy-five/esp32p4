import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import { evaluateTransition, IMPLEMENTED_GATES } from "../../src/lib/gates.js";
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
  assert.match(report.authority, /not authenticated/);
});

test("missing, stale, expired or foreign approval cannot advance", () => {
  assert.match(gate(run(packet(), { approvals: [] }), "approval_granted").reason, /no merge approval record/);
  const cases = [
    [approval({ sha: NEW_HEAD }), /head is/],
    [approval({ granted_at: "2026-10-08T00:00:00Z" }), /expired/],
    [approval({ approver: "implementer" }), /not an overseer/],
    [approval({ plan_id: "plan_superseded_01" }), /not current/],
    [approval({ stage: "plan" }), /stage plan/],
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

test("gate check CLI exits 0 on pass and 2 on failure", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gate-cli-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const files = packet().map((doc, i) => {
    const file = path.join(dir, `${i}.json`);
    fs.writeFileSync(file, JSON.stringify(doc));
    return file;
  });
  const approvals = path.join(dir, "approvals.json");
  fs.writeFileSync(approvals, JSON.stringify([approval()]));
  const out = [];
  const io = { stdout: (s) => out.push(s), stderr: (s) => out.push(s) };
  const args = ["gate", "check", ...files, "--head-sha", HEAD, "--overseer", "owner", "--now", "2026-10-12T02:00:00Z"];
  assert.equal(await main([...args, "--approvals", approvals], io), 0, out.join("\n"));
  assert.match(out[0], /^PASS awaiting_approval -> done/);
  out.length = 0;
  assert.equal(await main(args, io), 2);
  assert.match(out.join("\n"), /FAIL approval_granted/);
  assert.equal(await main(["gate", "check", ...files, "--head-sha", HEAD, "--format", "yaml"], io), 1);
});
