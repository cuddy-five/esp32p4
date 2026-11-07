/*
 * Evaluate state-machine gates over a task's contract documents.
 *
 * Pure: the caller supplies parsed documents, the head commit, the changed paths
 * and any human approval records. Every gate fails closed when a record is
 * missing, stale or produced by the role it should check. Producer names are
 * claims. An approval counts only when the caller marks it authenticated, which
 * the CLI does only for overseer comments it read from GitHub. A changed path in
 * an enabled review domain (.review-domains.json) that names the security
 * auditor requires a security review at any risk level.
 */
import { ContractRegistry } from "./contracts.js";
import { loadApprovals, loadStateMachine, requiredHumanStages } from "./orchestration.js";
import { evaluateBudget, findOutOfScopePaths } from "../evidence.js";
import { loadReviewDomains, selectReviewDomains } from "../review-domains.js";

const APPROVING = new Set(["approve", "approve_with_comments"]);
const BLOCKING = new Set(["request_changes", "block"]);
/** Review kinds whose blocking verdict sends the change back to the implementer. */
const REPAIR_KINDS = new Set(["code", "security", "verification"]);
const OPEN_ESCALATION = new Set(["open", "acknowledged"]);
const HOUR_MS = 3600 * 1000;

export const AUTHORITY_NOTE =
  "Producer names are claims, not authenticated identities. Approvals count only from an overseer's PR comment read from GitHub, which identifies the account, not the person using it. A pass does not grant merge permission.";

const nameOf = (doc) => String(doc?.producer?.name ?? "").trim().toLowerCase();
const byCreated = (a, b) => Date.parse(a.created_at) - Date.parse(b.created_at);
const short = (sha) => (typeof sha === "string" ? sha.slice(0, 12) : String(sha));

/**
 * Group validated documents for one task. Throws on invalid or mixed input.
 * A record delivered twice with identical content counts once and is listed in
 * `duplicates`; two different records under one id are an error, because
 * either could be the real one.
 * @param {object[]} docs parsed contract documents
 */
export function collectPacket(input, { contracts = new ContractRegistry() } = {}) {
  const seen = new Map();
  const duplicates = [];
  const docs = [];
  for (const doc of input) {
    const id = doc?.id;
    const body = JSON.stringify(doc);
    if (typeof id === "string" && seen.has(id)) {
      if (seen.get(id) !== body) throw new Error(`conflicting records: two different documents share id ${id}`);
      duplicates.push(id);
      continue;
    }
    if (typeof id === "string") seen.set(id, body);
    docs.push(doc);
  }
  const problems = [];
  docs.forEach((doc, i) => {
    const r = contracts.validate(doc);
    if (!r.ok) problems.push(`document ${i + 1} (${doc?.contract ?? "unknown"}): ${r.errors.map((e) => `${e.path} ${e.message}`).join("; ")}`);
  });
  if (problems.length) throw new Error(`invalid documents: ${problems.join(" | ")}`);
  const tasks = docs.filter((d) => d.contract === "task");
  if (tasks.length !== 1) throw new Error(`expected exactly one task document, got ${tasks.length}`);
  const [task] = tasks;
  const foreign = docs.filter((d) => d.contract !== "task" && d.task_id !== task.id);
  if (foreign.length) throw new Error(`documents for another task: ${foreign.map((d) => d.id).join(", ")}`);
  const of = (kind) => docs.filter((d) => d.contract === kind).sort(byCreated);
  return {
    task,
    plans: of("plan"),
    reviews: of("review"),
    evidence: of("evidence"),
    handoffs: of("handoff"),
    escalations: of("escalation"),
    results: of("result"),
    duplicates,
  };
}

/** The one plan that no other plan supersedes and that is not rejected or superseded. */
function currentPlans(plans) {
  const superseded = new Set(plans.map((p) => p.supersedes).filter(Boolean));
  return plans.filter((p) => !superseded.has(p.id) && !["rejected", "superseded"].includes(p.status));
}

/** Names that produced the change: implementer handoffs and implementer-role producers. */
export function implementerNames(packet) {
  const names = new Set();
  for (const d of [...packet.handoffs, ...packet.evidence, ...packet.reviews]) {
    if (d.producer?.role === "implementer" || (d.contract === "handoff" && d.from_role === "implementer")) names.add(nameOf(d));
  }
  names.delete("");
  return names;
}

/**
 * Reviewers whose own latest review of `kind` at `sha` blocks. A blocking
 * verdict is cleared only by the same reviewer's later review or by a new
 * commit; another reviewer's approval does not outvote it (ADR 0003).
 */
export function openObjections(reviews, kind, sha, implementers) {
  const latestBy = new Map();
  for (const r of reviews) {
    if (r.review_kind !== kind || r.subject.sha !== sha) continue;
    if (implementers.has(nameOf(r)) || r.producer?.role === "implementer") continue;
    latestBy.set(nameOf(r), r);
  }
  return [...latestBy.values()].filter((r) => BLOCKING.has(r.verdict));
}

/**
 * Repair rounds used: distinct reviewed commits that a non-implementer's code,
 * security or verification review sent back. Each round produces a new commit,
 * so several blocking reviews of one commit are one round.
 */
export function repairRounds(packet, implementers) {
  const shas = new Set();
  for (const r of packet.reviews) {
    if (!REPAIR_KINDS.has(r.review_kind) || !BLOCKING.has(r.verdict)) continue;
    if (implementers.has(nameOf(r)) || r.producer?.role === "implementer") continue;
    shas.add(r.subject.sha);
  }
  return shas.size;
}

/** Latest review of a kind for the head commit, with a reason when none qualifies. */
function latestReview(ctx, kind, { notBy, label }) {
  if (!notBy.size) return { pass: false, reason: `${label} review cannot be checked for self-review: no implementer handoff or implementer-role producer` };
  const all = ctx.packet.reviews.filter((r) => r.review_kind === kind);
  if (!all.length) return { pass: false, reason: `no ${label} review` };
  const atHead = all.filter((r) => r.subject.sha === ctx.headSha);
  if (!atHead.length) {
    return { pass: false, reason: `${label} review is stale: it covers ${short(all.at(-1).subject.sha)}, head is ${short(ctx.headSha)}` };
  }
  const latest = atHead.at(-1);
  if (notBy.has(nameOf(latest)) || latest.producer?.role === "implementer") {
    return { pass: false, reason: `${label} review is self-review: "${latest.producer.name}" produced the work` };
  }
  if (!APPROVING.has(latest.verdict)) return { pass: false, reason: `latest ${label} review verdict is ${latest.verdict}` };
  const objections = openObjections(ctx.packet.reviews, kind, ctx.headSha, notBy).filter((r) => nameOf(r) !== nameOf(latest));
  if (objections.length) {
    const who = objections.map((r) => `"${r.producer.name}" (${r.id}) ${r.verdict}`).join(", ");
    return { pass: false, reason: `conflicting ${label} reviews at ${short(ctx.headSha)}: ${who}, "${latest.producer.name}" approves; adjudicate, then escalate conflicting_reviews` };
  }
  return { pass: true, reason: `${label} review ${latest.id} by ${latest.producer.name} approves ${short(ctx.headSha)}` };
}

/** Step kinds that only read; every other kind may write files. */
const READ_ONLY_STEPS = new Set(["investigate", "verify"]);

function planStagePaths(plan) {
  return [...new Set((plan?.steps ?? []).flatMap((s) => s.files_touched ?? []))];
}

/** Plan and git paths together; a writing step that lists no files sends the plan to a human. */
function needsHumanAtPlan(ctx) {
  const plan = ctx.plan;
  const unlisted = (plan?.steps ?? []).filter((s) => !READ_ONLY_STEPS.has(s.kind) && !s.files_touched?.length);
  if (!plan || unlisted.length) {
    return { required: true, reasons: [plan ? `steps ${unlisted.map((s) => s.id).join(", ")} list no files_touched` : "no current plan"] };
  }
  const paths = [...new Set([...planStagePaths(plan), ...(ctx.changedPaths ?? [])])];
  const { stages, reasons } = requiredHumanStages(ctx.policy, { risk: ctx.packet.task.risk, paths });
  return { required: stages.includes("plan"), reasons };
}

/** Enabled review domains that name the security auditor for a changed path. */
function securityDomains(ctx) {
  const paths = ctx.changedPaths ?? ctx.packet.evidence.filter((e) => e.subject.sha === ctx.headSha).flatMap((e) => e.diff?.paths ?? []);
  if (!paths.length) return [];
  const { covered } = selectReviewDomains([...new Set(paths)], ctx.reviewDomains ?? loadReviewDomains());
  return covered.filter((d) => d.role === "security_auditor" || d.security_role === "security_auditor").map((d) => d.domain);
}

/**
 * Split /halt and /resume controls into those that count for `taskId` and the
 * rest, each with a reason. Only authenticated controls by a policy overseer
 * count. A halt fails safe: every overseer /halt on the task's pull request
 * counts, whatever task it names. A /resume must name the task and be unedited.
 * @returns {{ counted: object[], ignored: string[] }}
 */
export function sortControls(controls, taskId, overseers) {
  const counted = [];
  const ignored = [];
  for (const c of controls ?? []) {
    const what = `${c.reference ?? "a comment"}: /${c.action}`;
    if (c.authenticated !== true) ignored.push(`${what} was not read from GitHub`);
    else if (!overseers.has(String(c.by ?? "").toLowerCase())) ignored.push(`${what} by ${c.by} does not count; only an overseer in policies/approvals.yaml can halt or resume`);
    else if (!Number.isFinite(Date.parse(c.at))) ignored.push(`${what} has no valid time`);
    else if (c.action === "resume" && c.task_id !== taskId) ignored.push(`${what} names task ${c.task_id}, not ${taskId}`);
    else if (c.action === "resume" && c.edited) ignored.push(`${what} was edited after posting; post a new comment`);
    else counted.push(c);
  }
  return { counted, ignored };
}

/** The overseer's latest counted /halt or /resume for this task, when it is a halt. */
export function haltInForce(ctx) {
  const { counted } = sortControls(ctx.controls, ctx.packet.task.id, ctx.overseers);
  const last = counted.sort((a, b) => Date.parse(a.at) - Date.parse(b.at)).at(-1);
  return last?.action === "halt" ? last : null;
}

const EVALUATORS = {
  task_valid: (ctx) => ({ pass: true, reason: `task ${ctx.packet.task.id} validates` }),

  plan_valid: (ctx) => {
    const current = currentPlans(ctx.packet.plans);
    if (current.length === 1) return { pass: true, reason: `current plan ${current[0].id}` };
    return { pass: false, reason: current.length ? `${current.length} competing current plans` : "no current plan" };
  },

  plan_reviewed: (ctx) => {
    if (!ctx.plan) return { pass: false, reason: "no current plan to review" };
    const reviews = ctx.packet.reviews.filter((r) => r.review_kind === "plan" && r.plan_id === ctx.plan.id);
    if (!reviews.length) return { pass: false, reason: `no plan review for ${ctx.plan.id}` };
    const latest = reviews.at(-1);
    if (nameOf(latest) === nameOf(ctx.plan) || latest.producer?.role === "planner") {
      return { pass: false, reason: `plan review is self-review: "${latest.producer.name}" wrote the plan` };
    }
    if (!APPROVING.has(latest.verdict)) return { pass: false, reason: `latest plan review verdict is ${latest.verdict}` };
    return { pass: true, reason: `plan review ${latest.id} by ${latest.producer.name}` };
  },

  approval_required: (ctx) => {
    const { required, reasons } = needsHumanAtPlan(ctx);
    return required
      ? { pass: true, reason: `plan stage needs a human (${reasons.join(", ")})` }
      : { pass: false, reason: "policy does not require a human at the plan stage" };
  },

  approval_not_required: (ctx) => {
    const { required, reasons } = needsHumanAtPlan(ctx);
    return required
      ? { pass: false, reason: `plan stage needs a human (${reasons.join(", ")})` }
      : { pass: true, reason: "policy requires no human at the plan stage" };
  },

  approval_granted: (ctx) => {
    const stage = ctx.stage;
    if (!ctx.plan) return { pass: false, reason: "no current plan to approve" };
    if (!ctx.overseers.size) return { pass: false, reason: "no overseer configured in policies/approvals.yaml approval.overseers" };
    const blocking = ctx.packet.escalations.find((e) => OPEN_ESCALATION.has(e.status) && ["high", "critical"].includes(e.severity));
    if (blocking) return { pass: false, reason: `approval invalidated by open ${blocking.severity} escalation ${blocking.id}` };
    const limit = (ctx.policy.approval?.expires_after_hours ?? 72) * HOUR_MS;
    const rejected = [];
    for (const a of ctx.approvals) {
      const why = [];
      if (a.stage !== stage) why.push(`stage ${a.stage}`);
      if (a.task_id !== ctx.packet.task.id) why.push("other task");
      if (a.plan_id !== ctx.plan.id) why.push(`plan ${a.plan_id} is not current`);
      if (a.authenticated !== true) why.push("not read from GitHub");
      if (!ctx.overseers.has(String(a.approver ?? "").toLowerCase())) why.push(`${a.approver} is not an overseer`);
      const at = Date.parse(a.granted_at);
      if (!Number.isFinite(at) || at > ctx.now) why.push("bad timestamp");
      else if (ctx.now - at > limit) why.push("expired");
      if (stage === "merge" && a.sha !== ctx.mergeSha) why.push(`approves ${short(a.sha)}, head is ${short(ctx.mergeSha)}`);
      if (!why.length) return { pass: true, reason: `${stage} approval by ${a.approver} at ${a.granted_at} (${a.reference})` };
      rejected.push(why.join(", "));
    }
    return { pass: false, reason: rejected.length ? `no valid ${stage} approval (${rejected.join("; ")})` : `no ${stage} approval record` };
  },

  evidence_collected: (ctx) => {
    if (!ctx.packet.evidence.length) return { pass: false, reason: "no evidence" };
    const atHead = ctx.packet.evidence.filter((e) => e.subject.sha === ctx.headSha);
    if (atHead.length) return { pass: true, reason: `evidence ${atHead.at(-1).id} for ${short(ctx.headSha)}` };
    return { pass: false, reason: `evidence is stale: it covers ${short(ctx.packet.evidence.at(-1).subject.sha)}, head is ${short(ctx.headSha)}` };
  },

  within_scope: (ctx) => {
    const atHead = ctx.packet.evidence.filter((e) => e.subject.sha === ctx.headSha);
    const recorded = atHead.flatMap((e) => e.diff?.out_of_scope_paths ?? []);
    if (!ctx.changedPaths) {
      const listed = atHead.filter((e) => Array.isArray(e.diff?.paths));
      if (!listed.length) return { pass: false, reason: "changed paths unknown: no --base and no head evidence lists diff.paths" };
      const partial = listed.filter((e) => e.diff.paths.length < e.diff.files_changed);
      if (partial.length) return { pass: false, reason: `evidence ${partial.map((e) => e.id).join(", ")} lists fewer paths than files_changed` };
    }
    const paths = ctx.changedPaths ?? [...new Set(atHead.flatMap((e) => e.diff?.paths ?? []))];
    const out = [...new Set([...findOutOfScopePaths(paths, ctx.packet.task.scope), ...recorded])];
    if (out.length) return { pass: false, reason: `out of scope: ${out.join(", ")}` };
    return { pass: true, reason: `${paths.length} changed paths within task scope${ctx.changedPaths ? " (from git)" : " (from evidence)"}` };
  },

  within_budget: (ctx) => {
    const used = {};
    for (const d of [...ctx.packet.plans, ...ctx.packet.reviews, ...ctx.packet.evidence, ...ctx.packet.results]) {
      for (const [k, v] of Object.entries(d.budget_used ?? {})) if (Number.isFinite(v)) used[k] = (used[k] ?? 0) + v;
    }
    const b = evaluateBudget(used, ctx.packet.task.budget);
    return { pass: b.withinBudget, reason: b.details };
  },

  reviews_approve: (ctx) => {
    const code = latestReview(ctx, "code", { notBy: ctx.implementers, label: "code" });
    if (!code.pass) return code;
    const level = ctx.packet.task.risk.level;
    const because = [];
    if (ctx.policy.by_risk?.[level]?.security_review === "required") because.push(`${level} risk`);
    const domains = securityDomains(ctx);
    if (domains.length) because.push(`review domain ${domains.join(", ")}`);
    if (!because.length) return code;
    const sec = latestReview(ctx, "security", { notBy: ctx.implementers, label: "security" });
    return sec.pass
      ? { pass: true, reason: `${code.reason}; ${sec.reason}` }
      : { pass: false, reason: `${sec.reason} (required by ${because.join(" and ")})` };
  },

  verification_passed: (ctx) => {
    const own = ctx.packet.evidence.filter((e) => e.producer?.role === "verifier" && e.subject.sha === ctx.headSha);
    if (!own.length) return { pass: false, reason: `no verifier evidence for ${short(ctx.headSha)}` };
    const ev = own.at(-1);
    if (!ctx.implementers.size) return { pass: false, reason: "verifier independence cannot be checked: no implementer handoff or implementer-role producer" };
    if (ctx.implementers.has(nameOf(ev))) return { pass: false, reason: `verifier evidence was produced by implementer "${ev.producer.name}"` };
    const checks = ev.checks ?? [];
    const greenCheck = checks.some((c) => c.required !== false && c.conclusion === "success");
    if (!greenCheck && !(ev.tests?.passed > 0)) return { pass: false, reason: `verifier evidence ${ev.id} records no passing check or test` };
    const failed = checks.filter((c) => c.required !== false && c.conclusion !== "success").map((c) => `${c.name}=${c.conclusion}`);
    if (ev.tests?.failed) failed.push(`${ev.tests.failed} failed tests`);
    if (failed.length) return { pass: false, reason: `verifier evidence ${ev.id} is not green: ${failed.join(", ")}` };
    const notBy = new Set([...ctx.implementers]);
    const review = latestReview(ctx, "verification", { notBy, label: "verification" });
    return review.pass ? { pass: true, reason: `evidence ${ev.id}; ${review.reason}` } : review;
  },

  retry_budget_remaining: (ctx) => {
    const limit = ctx.limits.repair_rounds;
    if (!Number.isInteger(limit)) return { pass: false, reason: "state machine sets no limits.repair_rounds" };
    const used = repairRounds(ctx.packet, ctx.implementers);
    return used <= limit
      ? { pass: true, reason: `repair round ${used} of ${limit}` }
      : { pass: false, reason: `repair limit reached: ${used} rounds, limit ${limit}; escalate repeated_failure to the human` };
  },

  no_open_escalation: (ctx) => {
    const halt = haltInForce(ctx);
    if (halt) {
      const named = halt.task_id && halt.task_id !== ctx.packet.task.id ? `; it names task ${halt.task_id}, and a halt on the pull request stops this task` : "";
      return { pass: false, reason: `halted by overseer ${halt.by} at ${halt.at} (${halt.reference})${named}; post /resume task=${ctx.packet.task.id} to lift it` };
    }
    const open = ctx.packet.escalations.filter((e) => OPEN_ESCALATION.has(e.status));
    return open.length
      ? { pass: false, reason: `open escalations: ${open.map((e) => `${e.id} (${e.reason})`).join(", ")}` }
      : { pass: true, reason: "no open escalation or halt" };
  },
};

/** Gate names this module evaluates; state-machine.yaml must mark exactly these implemented. */
export const IMPLEMENTED_GATES = Object.freeze(Object.keys(EVALUATORS));

/**
 * Evaluate every gate on the transition `from -> to`.
 * `headSha` is the commit that evidence and reviews must cover; `mergeSha`
 * (default `headSha`) is the commit a merge approval must name. They differ
 * when records-only commits follow the reviewed commit (see task-records.js).
 * @param {object[]} docs parsed contract documents for one task
 * @param {{
 *   from?: string, to?: string, headSha: string, mergeSha?: string, changedPaths?: string[],
 *   approvals?: object[], controls?: object[], overseers?: string[], now?: number,
 *   stateMachine?: any, policy?: any, reviewDomains?: any,
 * }} opts (reviewDomains defaults to .review-domains.json)
 */
export function evaluateTransition(docs, opts) {
  const { from = "awaiting_approval", to = "done", headSha } = opts;
  const mergeSha = opts.mergeSha ?? headSha;
  for (const sha of [headSha, mergeSha]) {
    if (typeof sha !== "string" || !/^[0-9a-f]{40}$/.test(sha)) throw new Error("head sha must be 40 lowercase hex characters");
  }
  const sm = opts.stateMachine ?? loadStateMachine();
  if (!opts.stateMachine && sm.problems.length) throw new Error("state machine is invalid; run policy check");
  const policyDoc = opts.policy ?? (() => {
    const ap = loadApprovals();
    if (ap.problems.length) throw new Error("approval policy is invalid; run policy check");
    return ap.doc;
  })();
  const transition = (sm.edges ?? []).find((e) => e.from === from && e.to === to);
  if (!transition) throw new Error(`no transition ${from} -> ${to} in the state machine`);

  const packet = collectPacket(docs);
  const current = currentPlans(packet.plans);
  const ctx = {
    packet,
    plan: current.length === 1 ? current[0] : undefined,
    headSha,
    mergeSha,
    changedPaths: opts.changedPaths,
    approvals: opts.approvals ?? [],
    controls: opts.controls ?? [],
    overseers: new Set((opts.overseers ?? policyDoc.approval?.overseers ?? []).map((o) => String(o).toLowerCase())),
    now: opts.now ?? Date.now(),
    policy: policyDoc,
    stage: to === "done" ? "merge" : "plan",
    implementers: implementerNames(packet),
    reviewDomains: opts.reviewDomains,
    limits: sm.doc?.limits ?? {},
  };
  const gates = transition.gates.map((gate) => {
    const evaluate = EVALUATORS[gate];
    const r = evaluate ? evaluate(ctx) : { pass: false, reason: "gate not implemented; fails closed" };
    return { gate, ...r };
  });
  return {
    transition: `${from} -> ${to}`,
    task_id: packet.task.id,
    plan_id: ctx.plan?.id ?? null,
    stage: ctx.stage,
    head_sha: headSha,
    merge_sha: mergeSha,
    ok: gates.every((g) => g.pass),
    gates,
    duplicates: packet.duplicates,
    ignored_controls: sortControls(ctx.controls, packet.task.id, ctx.overseers).ignored,
    overseers: [...ctx.overseers],
    authority: AUTHORITY_NOTE,
  };
}
