import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import { evaluateTransition } from "../../src/lib/gates.js";
import { loadStateMachine } from "../../src/lib/orchestration.js";
import { assessTask } from "../../src/lib/recovery.js";
import { main } from "../../src/cli.js";
import { parseApprovalComments } from "../../src/lib/approval-comments.js";

const root = fileURLToPath(new URL("../..", import.meta.url));
const example = (kind) => JSON.parse(fs.readFileSync(path.join(root, `.github/control-plane/contracts/examples/${kind}.example.json`), "utf8"));
const HEAD = "0123456789abcdef0123456789abcdef01234567";
const SHA_B = "2222222222222222222222222222222222222222";
const SHA_C = "3333333333333333333333333333333333333333";
const NEW_HEAD = "1111111111111111111111111111111111111111";
const NOW = Date.parse("2026-10-12T02:00:00Z");

/** The complete low-risk packet from gates.test.js: everything but the human approval. */
function packet() {
  const planReview = { ...example("review"), id: "review_plan_0001", created_at: "2026-10-12T00:10:00Z", producer: { kind: "agent", name: "plan-reviewer", role: "reviewer" }, review_kind: "plan" };
  delete planReview.evidence_id;
  const verifierEvidence = { ...example("evidence"), id: "evidence_verifier_0001", created_at: "2026-10-12T01:00:00Z", producer: { kind: "agent", name: "verifier", role: "verifier" }, budget_used: { tokens: 10000 } };
  const verification = { ...example("review"), id: "review_verify_0001", created_at: "2026-10-12T01:05:00Z", producer: { kind: "agent", name: "verifier", role: "verifier" }, review_kind: "verification", evidence_id: verifierEvidence.id, budget_used: { tokens: 1000 } };
  return [example("task"), example("plan"), planReview, example("handoff"), example("evidence"), example("review"), verifierEvidence, verification];
}

/** A code review by `name` of commit `sha`. */
const codeReview = (id, name, verdict, sha = HEAD, at = "2026-10-12T01:10:00Z") => ({
  ...example("review"), id, created_at: at, producer: { kind: "agent", name, role: "reviewer" }, verdict, subject: { sha }, budget_used: { tokens: 1 },
});
const assess = (docs, over = {}) => assessTask(docs, { headSha: HEAD, now: NOW, ...over });
const gate = (docs, name, over = {}) => evaluateTransition(docs, { headSha: HEAD, now: NOW, approvals: [], ...over }).gates.find((g) => g.gate === name);

test("a verified task waits for the human, who is told what to post", () => {
  const r = assess(packet());
  assert.equal(r.state, "awaiting_approval");
  assert.equal(r.next_role, "human");
  assert.deepEqual(r.stale, []);
  assert.match(r.next_actions.join("\n"), /\/approve merge line/);
  assert.match(r.note, /records only/);
});

test("a later commit names every stale review and evidence and who redoes it", () => {
  const r = assess(packet(), { headSha: NEW_HEAD });
  assert.equal(r.state, "in_progress");
  assert.equal(r.next_role, "implementer");
  assert.deepEqual(r.stale.map((s) => [s.kind, s.redo]).sort(), [
    ["code review", "reviewer"],
    ["evidence", "implementer"],
    ["verification review", "verifier"],
    ["verifier evidence", "verifier"],
  ]);
  // Without implementer evidence nothing is stale for the implementer, yet it acts next: it still gets the first action.
  const noOwnEvidence = packet().filter((d) => !(d.contract === "evidence" && d.producer.role !== "verifier"));
  const r2 = assess(noOwnEvidence, { headSha: NEW_HEAD });
  assert.equal(r2.next_role, "implementer");
  assert.match(r2.next_actions[0], /^implementer: gate evidence_collected: evidence is stale/);
});

test("a blocking review sends the work back and counts one repair round per commit", () => {
  const docs = [...packet(), codeReview("review_code_block_1", "reviewer", "request_changes"), codeReview("review_sec_block_1", "auditor", "block")];
  docs.at(-1).review_kind = "security";
  const r = assess(docs);
  assert.equal(r.state, "in_review");
  assert.equal(r.next_role, "implementer");
  assert.equal(r.repair.used, 1, "two blocking reviews of one commit are one round");
  assert.match(r.next_actions.join("\n"), /implementer: repair the findings in review_code_block_1, review_sec_block_1 \(round 1 of 2\)/);
  const retry = gate(docs, "retry_budget_remaining", { from: "in_review", to: "in_progress" });
  assert.equal(retry.pass, true, retry.reason);
});

test("a third repair round is refused and the coordinator must escalate", () => {
  const docs = [
    ...packet(),
    codeReview("review_code_round_1", "reviewer", "request_changes", SHA_B, "2026-10-12T00:50:00Z"),
    codeReview("review_code_round_2", "reviewer", "request_changes", SHA_C, "2026-10-12T00:52:00Z"),
    codeReview("review_code_round_3", "reviewer", "request_changes", HEAD, "2026-10-12T01:10:00Z"),
  ];
  const retry = gate(docs, "retry_budget_remaining", { from: "in_review", to: "in_progress" });
  assert.equal(retry.pass, false);
  assert.match(retry.reason, /3 rounds, limit 2; escalate repeated_failure/);
  const r = assess(docs);
  assert.equal(r.repair.exhausted, true);
  assert.equal(r.next_role, "coordinator");
  // The implementer's own "review" is not a round.
  const self = [...packet(), { ...codeReview("review_self_1", "implementer", "request_changes", SHA_B), producer: { kind: "agent", name: "implementer", role: "implementer" } }];
  assert.equal(assess(self).repair.used, 0);
});

test("another reviewer's approval does not outvote an objection at the same commit", () => {
  const objection = codeReview("review_code_block_1", "reviewer-a", "request_changes", HEAD, "2026-10-12T00:56:00Z");
  const docs = [...packet(), objection];
  // The example code review (by "reviewer", 00:55) approves; reviewer-a objects later: one adjudication is due.
  const r1 = assess(docs);
  assert.equal(r1.next_role, "coordinator");
  assert.match(r1.next_actions[0], /run 1 independent adjudication, then escalate conflicting_reviews/);
  // reviewer-b adjudicates and approves: that uses the one attempt, and the objection still stands.
  docs.push(codeReview("review_code_ok_b", "reviewer-b", "approve", HEAD, "2026-10-12T01:20:00Z"));
  const g = gate(docs, "reviews_approve");
  assert.equal(g.pass, false);
  assert.match(g.reason, /conflicting code reviews .*"reviewer-a" \(review_code_block_1\) request_changes, "reviewer-b" approves; adjudicate/);
  const r = assess(docs);
  assert.equal(r.next_role, "coordinator");
  assert.equal(r.objections[0].adjudications, 1);
  assert.match(r.next_actions[0], /after 1 adjudication review, the limit; escalate conflicting_reviews to the human/);
  // The objector's own later approval clears it.
  docs.push(codeReview("review_code_ok_a", "reviewer-a", "approve", HEAD, "2026-10-12T01:30:00Z"));
  assert.equal(gate(docs, "reviews_approve").pass, true);
});

test("a record delivered twice counts once; two different records under one id are an error", () => {
  const docs = packet();
  docs.push(structuredClone(docs[5]));
  const r = assess(docs);
  assert.deepEqual(r.duplicates, [docs[5].id]);
  assert.equal(r.state, "awaiting_approval");
  assert.match(r.next_actions.join("\n"), /ignore duplicate deliveries/);
  const forged = packet();
  forged.push({ ...forged[5], verdict: "request_changes" });
  assert.throws(() => assess(forged), /conflicting records: two different documents share id/);
  assert.throws(() => gate(forged, "reviews_approve"), /conflicting records/);
});

test("an open escalation blocks the task and names the human's decision", () => {
  const docs = [...packet(), { ...example("escalation"), status: "open" }];
  const r = assess(docs);
  assert.equal(r.state, "blocked");
  assert.equal(r.next_role, "human");
  assert.match(r.next_actions[0], /^human: resolve escalation esc_/);
});

test("a handoff's next actions apply only until a later record moves the task on", () => {
  const handoff = { ...example("handoff"), id: "handoff_late_0001", created_at: "2026-10-12T01:40:00Z", next_actions: ["Re-run the flaky test"], expires_at: "2026-10-12T01:50:00Z" };
  const r = assess([...packet(), handoff]);
  assert.match(r.next_actions.join("\n"), /reviewer: from handoff_late_0001: Re-run the flaky test/);
  assert.match(r.next_actions.join("\n"), /handoff_late_0001 expired/);
  assert.doesNotMatch(assess(packet()).next_actions.join("\n"), /from handoff_/);
});

test("state machine limits are validated", () => {
  const sm = YAML.parse(fs.readFileSync(path.join(root, ".github/control-plane/orchestration/state-machine.yaml"), "utf8"));
  assert.deepEqual(sm.limits, { repair_rounds: 2, adjudication_attempts: 1 }, "ADR 0003: two repair rounds, one adjudication");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sm-limits-"));
  const file = path.join(dir, "state-machine.yaml");
  fs.writeFileSync(file, YAML.stringify({ ...sm, limits: { repair_rounds: -1 } }));
  const problems = loadStateMachine({ file }).problems.map((p) => p.path);
  assert.ok(problems.includes("/limits/repair_rounds"));
  assert.ok(problems.includes("/limits/adjudication_attempts"));
});

test("task status CLI prints the report and exits 0; usage errors exit 1", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "task-status-"));
  const files = packet().map((doc, i) => {
    const f = path.join(dir, `${i}.json`);
    fs.writeFileSync(f, JSON.stringify(doc));
    return f;
  });
  const out = [];
  const io = { stdout: (s) => out.push(s), stderr: (s) => out.push(s) };
  assert.equal(await main(["task", "status", ...files, "--head-sha", NEW_HEAD, "--now", "2026-10-12T02:00:00Z"], io), 0);
  const text = out.join("\n");
  assert.match(text, /state: +in_progress/);
  assert.match(text, /stale: +review_01J9Z3V3P4O5I6U7Y8T9R0E1W2 \(code review\)/);
  assert.match(text, /does not show whether a worker/);
  out.length = 0;
  assert.equal(await main(["task", "status", ...files, "--head-sha", HEAD, "--format", "json"], io), 0);
  assert.equal(JSON.parse(out.join("\n")).next_role, "human");
  assert.equal(await main(["task", "nope"], io), 1);
  assert.equal(await main(["task", "status", "--head-sha", HEAD], io), 1);
});

/** A PR conversation comment in the GitHub REST shape, by the policy overseer. */
const comment = (body, over = {}) => ({
  id: 9,
  html_url: "https://github.com/o/r/pull/24#issuecomment-9",
  body,
  user: { login: "cuddy-five", type: "User" },
  created_at: "2026-10-12T01:30:00Z",
  updated_at: "2026-10-12T01:30:00Z",
  performed_via_github_app: null,
  ...over,
});
const TASK = example("task").id;

test("halt and resume comments: a halt fails safe, a resume must be exact; bot lines are ignored", () => {
  const { controls, ignored } = parseApprovalComments([
    comment(`/halt task=${TASK} the verifier is misreporting`),
    comment(`/resume task=${TASK}`, { id: 10, created_at: "2026-10-12T01:40:00Z", updated_at: "2026-10-12T01:40:00Z" }),
    comment("/halt", { id: 11 }),
    comment(`/halt task=${TASK}`, { id: 12, updated_at: "2026-10-12T01:50:00Z" }),
    comment(`/halt task=${TASK}`, { id: 13, user: { login: "bot", type: "Bot" } }),
    comment(`/halted task=${TASK}`, { id: 14 }),
    comment("  /halt! stop everything", { id: 15 }),
    comment("/resume", { id: 16 }),
  ]);
  assert.deepEqual(controls.map((c) => [c.action, c.task_id, c.reason, c.edited]), [
    ["halt", TASK, "the verifier is misreporting", false],
    ["resume", TASK, null, false],
    ["halt", null, null, false],
    ["halt", TASK, null, true],
    ["halt", null, "! stop everything", false],
  ]);
  assert.equal(ignored.length, 2);
  assert.match(ignored.join("\n"), /bot is not a user account/);
  assert.match(ignored.join("\n"), /malformed \/resume line; it must be \/resume task=<task_id>/);
  // An edit still voids an approval.
  const edited = parseApprovalComments([comment(`/approve plan task=${TASK} plan=p1`, { updated_at: "2026-10-12T01:50:00Z" })]);
  assert.deepEqual(edited.approvals, []);
  assert.match(edited.ignored[0], /approval edited after posting/);
});

test("an overseer's /halt fails the gates and blocks the task until /resume", () => {
  const halt = { action: "halt", task_id: TASK, by: "owner", at: "2026-10-12T01:30:00Z", reference: "c1", authenticated: true };
  const resume = { ...halt, action: "resume", at: "2026-10-12T01:40:00Z", reference: "c2" };
  const g = (controls, over = {}) => gate(packet(), "no_open_escalation", { controls, overseers: ["owner"], ...over });
  assert.match(g([halt]).reason, /halted by overseer owner .*post \/resume task=/);
  assert.equal(g([halt, resume]).pass, true);
  assert.equal(g([resume, { ...halt, at: "2026-10-12T01:50:00Z" }]).pass, false, "the latest control wins");
  assert.equal(g([{ ...halt, by: "implementer" }]).pass, true, "only an overseer can halt");
  assert.equal(g([{ ...halt, authenticated: false }]).pass, true, "only controls read from GitHub count");
  // A halt fails safe: one naming another task, or none, still stops the pull request's task.
  assert.match(g([{ ...halt, task_id: "task_other_0001" }]).reason, /halted by overseer owner .*it names task task_other_0001/);
  assert.equal(g([{ ...halt, task_id: null }]).pass, false);
  // A resume must be exact: another task's, or an edited one, does not lift the halt.
  assert.equal(g([halt, { ...resume, task_id: "task_other_0001" }]).pass, false);
  assert.equal(g([halt, { ...resume, edited: true }]).pass, false);
  // Every agent transition that checks escalations now stops, including the implementer's handoff to review.
  assert.equal(gate(packet(), "no_open_escalation", { from: "in_progress", to: "in_review", controls: [halt], overseers: ["owner"] }).pass, false);
  const r = assess(packet(), { controls: [halt], overseers: ["owner"] });
  assert.equal(r.state, "blocked");
  assert.equal(r.next_role, "human");
  assert.equal(r.halted.by, "owner");
  assert.match(r.next_actions[0], /halted by owner .*confirm every worker and job stopped, then post \/resume/);
});

test("task status --pr reads the overseer's halt from the pull request", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "task-halt-"));
  const files = packet().map((doc, i) => {
    const f = path.join(dir, `${i}.json`);
    fs.writeFileSync(f, JSON.stringify(doc));
    return f;
  });
  const client = (headSha = HEAD) => ({
    request: async () => ({ data: { head: { sha: headSha } } }),
    paginate: async () => [comment(`/halt task=${TASK}`)],
  });
  const out = [];
  const io = (c) => ({ stdout: (s) => out.push(s), stderr: (s) => out.push(s), env: {}, client: c });
  const args = ["task", "status", ...files, "--head-sha", HEAD, "--pr", "24", "--repo", "o/r", "--now", "2026-10-12T02:00:00Z"];
  assert.equal(await main(args, io(client())), 0, out.join("\n"));
  assert.match(out.join("\n"), /state: +blocked/);
  assert.match(out.join("\n"), /halted: +by cuddy-five/);
  assert.doesNotMatch(out.join("\n"), /halt: +not checked/);
  out.length = 0;
  assert.equal(await main(args, io(client(NEW_HEAD))), 1);
  assert.match(out.join("\n"), /is not the head of PR #24/);

  // Commands that do not count are shown, so a halt or resume that failed is never silent.
  out.length = 0;
  const later = { created_at: "2026-10-12T01:40:00Z", updated_at: "2026-10-12T01:45:00Z" };
  const mixed = { ...client(), paginate: async () => [comment(`/halt task=${TASK}`), comment(`/resume task=${TASK}`, { id: 10, ...later }), comment(`/halt task=${TASK}`, { id: 11, user: { login: "passer-by", type: "User" } })] };
  assert.equal(await main(args, io(mixed)), 0, out.join("\n"));
  const text = out.join("\n");
  assert.match(text, /state: +blocked/, "an edited /resume does not lift the halt");
  assert.match(text, /ignored: +.*\/resume was edited after posting; post a new comment/);
  assert.match(text, /ignored: +.*\/halt by passer-by does not count; only an overseer/);

  // Without --pr the halt is unknown, and the report says so.
  out.length = 0;
  assert.equal(await main(["task", "status", ...files, "--head-sha", HEAD, "--now", "2026-10-12T02:00:00Z"], io(client())), 0);
  assert.match(out.join("\n"), /halt: +not checked; pass --pr <number>/);

  // When GitHub cannot be read, the command fails and says that no role may act.
  out.length = 0;
  const denied = { request: async () => { throw new Error("GET /repos/o/r/pulls/24 -> 401: Bad credentials"); }, paginate: async () => [] };
  assert.equal(await main(args, io(denied)), 1);
  assert.match(out.join("\n"), /cannot read the overseer's comments on PR #24: GET .* 401: Bad credentials/);
  assert.match(out.join("\n"), /whether the task is halted or approved is unknown, so no role may act on it/);
});
