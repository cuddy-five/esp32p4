/*
 * Where a task stands and who acts next, from its records alone.
 *
 * Pure apart from reading the policy files. The report is what a resuming agent
 * or the owner reads instead of the session that produced the records. The
 * position comes from the merge-decision gates at the head commit, so it does
 * not depend on every role writing a handoff: the first gate that fails in
 * pipeline order names the state and the role that acts next. It also lists
 * the reviews and evidence the head commit made stale, open objections and
 * escalations, repair rounds against the limit, and duplicate deliveries.
 * Records are claims: they do not show what a worker or GitHub job is doing now.
 */
import { collectPacket, evaluateTransition, implementerNames, openObjections, repairRounds } from "./gates.js";
import { loadStateMachine } from "./orchestration.js";

const OPEN_ESCALATION = new Set(["open", "acknowledged"]);
const APPROVING = new Set(["approve", "approve_with_comments"]);
const BLOCKING = new Set(["request_changes", "block"]);
const nameOf = (doc) => String(doc?.producer?.name ?? "").trim().toLowerCase();
const DONE_OUTCOMES = new Set(["success", "partial"]);
const short = (sha) => (typeof sha === "string" ? sha.slice(0, 12) : String(sha));

/** Who must redo a stale record of each kind. */
const REDO = [
  { label: "code review", role: "reviewer", match: (d) => d.contract === "review" && d.review_kind === "code" },
  { label: "security review", role: "security_auditor", match: (d) => d.contract === "review" && d.review_kind === "security" },
  { label: "verification review", role: "verifier", match: (d) => d.contract === "review" && d.review_kind === "verification" },
  { label: "verifier evidence", role: "verifier", match: (d) => d.contract === "evidence" && d.producer?.role === "verifier" },
  { label: "evidence", role: "implementer", match: (d) => d.contract === "evidence" && d.producer?.role !== "verifier" },
];

/**
 * Pipeline position for the first failing merge-decision gate. `blocked`
 * entries name who acts when that gate fails because a review objects.
 */
const POSITION = [
  ["no_open_escalation", "blocked", "human"],
  ["plan_valid", "planning", "planner"],
  ["plan_reviewed", "planning", "reviewer", "planner"],
  ["evidence_collected", "in_progress", "implementer"],
  ["within_scope", "in_progress", "implementer"],
  ["reviews_approve", "in_review", "reviewer", "implementer"],
  ["verification_passed", "verifying", "verifier", "implementer"],
  ["within_budget", "blocked", "human"],
  ["approval_granted", "awaiting_approval", "human"],
];

/**
 * @param {object[]} docs parsed contract documents for one task
 * @param {{ headSha: string, now?: number, changedPaths?: string[], stateMachine?: any, policy?: any }} opts
 *   headSha: the commit the records must cover (the subject, see task-records.js)
 */
export function assessTask(docs, { headSha, now = Date.now(), changedPaths, stateMachine, policy } = {}) {
  if (typeof headSha !== "string" || !/^[0-9a-f]{40}$/.test(headSha)) throw new Error("head sha must be 40 lowercase hex characters");
  const sm = stateMachine ?? loadStateMachine();
  const packet = collectPacket(docs);
  const { task } = packet;
  const implementers = implementerNames(packet);
  const limit = sm.doc?.limits?.repair_rounds;
  const actions = [];

  const result = packet.results.at(-1);
  const escalations = packet.escalations.filter((e) => OPEN_ESCALATION.has(e.status));
  const handoff = packet.handoffs.at(-1);
  for (const e of escalations) actions.push(`human: resolve escalation ${e.id} (${e.reason}, ${e.severity}): ${e.requested_decision}`);

  // Stale: the newest record of a kind covers another commit and none covers the head.
  const stale = [];
  for (const kind of REDO) {
    const all = [...packet.reviews, ...packet.evidence].filter(kind.match);
    if (!all.length || all.some((d) => d.subject.sha === headSha)) continue;
    const newest = all.sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at)).at(-1);
    stale.push({ id: newest.id, kind: kind.label, covers: newest.subject.sha, redo: kind.role });
    actions.push(`${kind.role}: redo the ${kind.label} for ${short(headSha)}; ${newest.id} covers ${short(newest.subject.sha)}`);
  }

  // Objections at the head. Another reviewer's approval does not clear one: that is a conflict.
  const objections = [];
  for (const kind of ["code", "security", "verification"]) {
    // Each reviewer's latest verdict at the head; a conflict needs another reviewer who approves.
    const latestBy = new Map();
    for (const r of packet.reviews) {
      if (r.review_kind === kind && r.subject.sha === headSha && !implementers.has(nameOf(r)) && r.producer?.role !== "implementer") latestBy.set(nameOf(r), r);
    }
    for (const r of openObjections(packet.reviews, kind, headSha, implementers)) {
      const conflict = [...latestBy.values()].some((o) => nameOf(o) !== nameOf(r) && APPROVING.has(o.verdict));
      objections.push({ id: r.id, kind, verdict: r.verdict, by: r.producer?.name ?? null, conflict });
    }
  }
  const adjudications = sm.doc?.limits?.adjudication_attempts;
  for (const o of objections.filter((x) => x.conflict)) {
    actions.push(`coordinator: ${o.kind} reviews conflict at ${short(headSha)} (${o.id} by ${o.by} ${o.verdict}, another reviewer approves); run ${adjudications ?? "the agreed"} independent adjudication, then escalate conflicting_reviews to the human`);
  }

  // Repair rounds: blocking reviews send work back; past the limit only the human decides.
  const used = repairRounds(packet, implementers);
  const exhausted = Number.isInteger(limit) && used > limit;
  const toRepair = objections.filter((o) => !o.conflict);
  if (exhausted) actions.push(`coordinator: repair limit reached (${used} rounds, limit ${limit}); escalate repeated_failure to the human, start no further round`);
  else if (toRepair.length) actions.push(`implementer: repair the findings in ${toRepair.map((o) => o.id).join(", ")} (round ${used} of ${limit ?? "?"})`);

  // Position: a result ends the task; otherwise the first failing merge-decision gate in pipeline order.
  const gates = evaluateTransition(docs, { headSha, now, changedPaths, approvals: [], stateMachine: sm, policy }).gates;
  const failing = new Map(gates.filter((g) => !g.pass).map((g) => [g.gate, g.reason]));
  let state;
  let nextRole;
  let source;
  if (result) {
    state = DONE_OUTCOMES.has(result.outcome) ? "done" : "cancelled";
    nextRole = null;
    source = `result ${result.id} (${result.outcome})`;
  } else {
    const [gate, at, role] = POSITION.find(([g]) => failing.has(g)) ?? POSITION.at(-1);
    state = at;
    nextRole = role;
    source = failing.has(gate) ? `gate ${gate}: ${failing.get(gate)}` : "every merge-decision gate except the human approval passes";
    const objects = (kinds) => objections.filter((o) => kinds.includes(o.kind));
    if (gate === "plan_reviewed" && BLOCKING.has(packet.reviews.filter((r) => r.review_kind === "plan").at(-1)?.verdict)) nextRole = "planner";
    if (gate === "reviews_approve" || gate === "verification_passed") {
      const kinds = gate === "reviews_approve" ? ["code", "security"] : ["verification"];
      if (objects(kinds).some((o) => o.conflict)) nextRole = "coordinator";
      else if (objects(kinds).length) nextRole = "implementer";
      else if (gate === "reviews_approve" && /^(no security review|security review)/.test(failing.get(gate))) nextRole = "security_auditor";
    }
    // Past the repair limit nobody starts another round; the coordinator escalates.
    if (exhausted && nextRole === "implementer" && objections.length) nextRole = "coordinator";
  }

  // A handoff's instructions apply only while no later review or evidence has moved the task on.
  const newest = Math.max(...[...packet.reviews, ...packet.evidence].map((d) => Date.parse(d.created_at)), -Infinity);
  if (handoff && !result && Date.parse(handoff.created_at) >= newest) {
    if (handoff.expires_at && Date.parse(handoff.expires_at) < now) actions.push(`coordinator: handoff ${handoff.id} expired at ${handoff.expires_at}; re-route before anyone resumes`);
    for (const b of handoff.blockers ?? []) actions.push(`${b.owner ?? "coordinator"}: blocker from ${handoff.id}: ${b.description}`);
    for (const a of handoff.next_actions ?? []) actions.push(`${handoff.to_role}: from ${handoff.id}: ${a}`);
  }
  if (packet.duplicates.length) actions.push(`coordinator: ignore duplicate deliveries of ${[...new Set(packet.duplicates)].join(", ")}; they count once`);

  if (!result && state === "awaiting_approval" && !escalations.length) {
    const blocking = gates.filter((g) => !g.pass && g.gate !== "approval_granted").map((g) => g.gate);
    if (!blocking.length) actions.push("human: read the reviews and evidence, then post the /approve merge line that gate check prints, or reject");
  }
  if (!actions.length && nextRole) actions.push(`${nextRole}: ${source}`);

  return {
    task_id: task.id,
    title: task.title,
    state,
    state_source: source,
    next_role: nextRole,
    head_sha: headSha,
    gates: gates.map((g) => ({ gate: g.gate, pass: g.pass, reason: g.reason })),
    last_handoff: handoff ? { id: handoff.id, from_role: handoff.from_role, to_role: handoff.to_role, state: handoff.state, working_ref: handoff.working_ref ?? null } : null,
    repair: { used, limit: limit ?? null, exhausted },
    stale,
    objections,
    open_escalations: escalations.map((e) => ({ id: e.id, reason: e.reason, severity: e.severity, status: e.status })),
    duplicates: packet.duplicates,
    next_actions: actions,
    note: "This report reads records only. It does not show whether a worker, CLI process or GitHub job is still running; check those directly.",
  };
}
