import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { CONTROL_PLANE_DIR, CONTRACTS_DIR } from "./paths.js";

export const STATE_MACHINE_FILE = path.join(CONTROL_PLANE_DIR, "orchestration", "state-machine.yaml");
export const APPROVALS_FILE = path.join(CONTROL_PLANE_DIR, "policies", "approvals.yaml");

/**
 * Enumerations the orchestration and policy files must agree with. Read from
 * the contract schemas so there is exactly one source of truth.
 */
export function contractEnums(contractsDir = CONTRACTS_DIR) {
  const read = (f) => JSON.parse(fs.readFileSync(path.join(contractsDir, f), "utf8"));
  const common = read("common.schema.json");
  const task = read("task.schema.json");
  const review = read("review.schema.json");
  return {
    states: task.properties.status.enum,
    roles: common.$defs.role.enum,
    riskLevels: common.$defs.risk_level.enum,
    riskTags: task.properties.risk.properties.tags.items.enum,
    reviewKinds: review.properties.review_kind.enum,
  };
}

/**
 * @typedef {{ file: string, path: string, message: string }} Problem
 */

const asArray = (v) => (Array.isArray(v) ? v : v === undefined ? [] : [v]);

/**
 * Load and validate the task state machine.
 * @param {{ file?: string, enums?: ReturnType<typeof contractEnums> }} [opts]
 * @returns {{ doc: any, problems: Problem[] }}
 */
export function loadStateMachine({ file = STATE_MACHINE_FILE, enums = contractEnums() } = {}) {
  const doc = YAML.parse(fs.readFileSync(file, "utf8"));
  const problems = [];
  const p = (pth, message) => problems.push({ file, path: pth, message });

  const states = Object.keys(doc.states ?? {});
  const stateSet = new Set(states);
  const contractStates = new Set(enums.states);
  for (const s of states) if (!contractStates.has(s)) p(`/states/${s}`, "not a task.status value");
  for (const s of enums.states) if (!stateSet.has(s)) p("/states", `task.status "${s}" has no state definition`);
  for (const [s, def] of Object.entries(doc.states ?? {})) {
    if (!def?.description) p(`/states/${s}/description`, "missing");
    if (!enums.roles.includes(def?.owner)) p(`/states/${s}/owner`, `"${def?.owner}" is not a contract role`);
  }

  if (!stateSet.has(doc.initial)) p("/initial", `"${doc.initial}" is not a defined state`);
  const terminal = new Set(asArray(doc.terminal));
  for (const t of terminal) if (!stateSet.has(t)) p("/terminal", `"${t}" is not a defined state`);

  const gates = doc.gates ?? {};
  for (const [g, def] of Object.entries(gates)) {
    if (!def?.description) p(`/gates/${g}/description`, "missing");
    if (!["implemented", "planned"].includes(def?.status)) p(`/gates/${g}/status`, "must be implemented or planned");
  }

  const transitions = asArray(doc.transitions);
  const edges = [];
  transitions.forEach((t, i) => {
    const froms = asArray(t.from);
    const tos = asArray(t.to);
    const actors = asArray(t.actor);
    if (froms.length === 0) p(`/transitions/${i}/from`, "missing");
    if (tos.length === 0) p(`/transitions/${i}/to`, "missing");
    if (actors.length === 0) p(`/transitions/${i}/actor`, "missing");
    for (const f of froms) {
      if (!stateSet.has(f)) p(`/transitions/${i}/from`, `"${f}" is not a defined state`);
      if (terminal.has(f)) p(`/transitions/${i}/from`, `"${f}" is terminal and cannot have outgoing transitions`);
    }
    for (const to of tos) if (!stateSet.has(to)) p(`/transitions/${i}/to`, `"${to}" is not a defined state`);
    for (const a of actors) if (!enums.roles.includes(a)) p(`/transitions/${i}/actor`, `"${a}" is not a contract role`);
    for (const g of asArray(t.gates)) if (!gates[g]) p(`/transitions/${i}/gates`, `gate "${g}" is not defined`);
    for (const f of froms) for (const to of tos) edges.push({ from: f, to, actors, gates: asArray(t.gates), index: i });
  });

  // Reachability: every state reachable from initial; every non-terminal state can reach a terminal.
  const reachable = closure(doc.initial, edges, (e) => e.from, (e) => e.to);
  for (const s of states) if (!reachable.has(s)) p(`/states/${s}`, "unreachable from initial");
  const canFinish = new Set();
  for (const t of terminal) for (const s of closure(t, edges, (e) => e.to, (e) => e.from)) canFinish.add(s);
  for (const s of states) if (!terminal.has(s) && !canFinish.has(s)) p(`/states/${s}`, "cannot reach a terminal state");

  // Separation of duties: human-owned states are left only by humans, except into blocked.
  for (const e of edges) {
    const owner = doc.states[e.from]?.owner;
    // Any listed actor may trigger a transition; adding human cannot authorize an agent.
    if (owner === "human" && e.to !== "blocked" && e.actors.some((actor) => actor !== "human")) {
      p(`/transitions/${e.index}`, `leaves human-owned state "${e.from}" with a non-human actor`);
    }
  }
  // Agents may never complete a task alone when approval is pending.
  for (const e of edges) {
    if (e.from === "awaiting_approval" && e.to === "done" && !e.gates.includes("approval_granted")) {
      p(`/transitions/${e.index}`, "awaiting_approval -> done must gate on approval_granted");
    }
  }

  for (const inv of asArray(doc.invariants)) {
    if (!inv?.id || !inv?.description) p("/invariants", "every invariant needs id and description");
  }

  return { doc, problems, edges };
}

function closure(start, edges, fromOf, toOf) {
  const seen = new Set([start]);
  const queue = [start];
  while (queue.length) {
    const cur = queue.shift();
    for (const e of edges) {
      if (fromOf(e) === cur && !seen.has(toOf(e))) {
        seen.add(toOf(e));
        queue.push(toOf(e));
      }
    }
  }
  return seen;
}

/**
 * Load and validate the approvals policy.
 * @param {{ file?: string, enums?: ReturnType<typeof contractEnums> }} [opts]
 * @returns {{ doc: any, problems: Problem[] }}
 */
export function loadApprovals({ file = APPROVALS_FILE, enums = contractEnums() } = {}) {
  const doc = YAML.parse(fs.readFileSync(file, "utf8"));
  const problems = [];
  const p = (pth, message) => problems.push({ file, path: pth, message });

  const stages = Object.keys(doc.stages ?? {});
  if (stages.length === 0) p("/stages", "at least one stage is required");
  const stageSet = new Set(stages);

  const byRisk = doc.by_risk ?? {};
  for (const level of enums.riskLevels) {
    if (!byRisk[level]) p(`/by_risk/${level}`, "missing policy for this risk level");
  }
  for (const [level, rule] of Object.entries(byRisk)) {
    if (!enums.riskLevels.includes(level)) p(`/by_risk/${level}`, "not a risk_level value");
    for (const s of asArray(rule?.human_stages)) if (!stageSet.has(s)) p(`/by_risk/${level}/human_stages`, `"${s}" is not a defined stage`);
    for (const r of asArray(rule?.required_reviews)) if (!enums.reviewKinds.includes(r)) p(`/by_risk/${level}/required_reviews`, `"${r}" is not a review_kind`);
    if (!["optional", "required"].includes(rule?.security_review)) p(`/by_risk/${level}/security_review`, "must be optional or required");
  }
  // Monotonic: higher risk never requires fewer human stages than lower risk.
  const order = enums.riskLevels;
  for (let i = 1; i < order.length; i++) {
    const lo = new Set(asArray(byRisk[order[i - 1]]?.human_stages));
    const hi = new Set(asArray(byRisk[order[i]]?.human_stages));
    for (const s of lo) if (!hi.has(s)) p(`/by_risk/${order[i]}/human_stages`, `drops stage "${s}" required at ${order[i - 1]}`);
  }

  asArray(doc.always_human).forEach((rule, i) => {
    if (!rule?.id) p(`/always_human/${i}/id`, "missing");
    if (asArray(rule?.paths).length === 0 && asArray(rule?.tags).length === 0) p(`/always_human/${i}`, "needs paths or tags");
    for (const t of asArray(rule?.tags)) if (!enums.riskTags.includes(t)) p(`/always_human/${i}/tags`, `"${t}" is not a task risk tag`);
    for (const s of asArray(rule?.stages)) if (!stageSet.has(s)) p(`/always_human/${i}/stages`, `"${s}" is not a defined stage`);
    if (asArray(rule?.stages).length === 0) p(`/always_human/${i}/stages`, "missing");
    for (const g of asArray(rule?.paths)) if (g.startsWith("/")) p(`/always_human/${i}/paths`, `"${g}" must be repository-relative`);
  });

  if (doc.approval?.must_be_from !== "human") p("/approval/must_be_from", 'must be "human"');
  if (!Number.isInteger(doc.approval?.expires_after_hours) || doc.approval.expires_after_hours <= 0) {
    p("/approval/expires_after_hours", "must be a positive integer");
  }

  return { doc, problems };
}

/**
 * Decide which stages require a human for a given task and set of touched paths.
 * Pure; used by the coordinator and by tests.
 * @param {any} approvals parsed approvals.yaml
 * @param {{ risk: { level: string, tags?: string[] }, paths?: string[] }} input
 * @returns {{ stages: string[], reasons: string[] }}
 */
export function requiredHumanStages(approvals, { risk, paths = [] }) {
  const stages = new Set(asArray(approvals.by_risk?.[risk.level]?.human_stages));
  const reasons = [];
  if (stages.size) reasons.push(`risk level ${risk.level}`);
  for (const rule of asArray(approvals.always_human)) {
    const tagHit = asArray(rule.tags).some((t) => asArray(risk.tags).includes(t));
    const pathHit = asArray(rule.paths).some((g) => paths.some((f) => globMatch(g, f)));
    if (tagHit || pathHit) {
      for (const s of asArray(rule.stages)) stages.add(s);
      reasons.push(rule.id);
    }
  }
  const order = Object.keys(approvals.stages ?? {});
  return { stages: [...stages].sort((a, b) => order.indexOf(a) - order.indexOf(b)), reasons };
}

/**
 * Minimal glob: `**` followed by `/` at a segment boundary matches zero or more directories;
 * other `**` spans paths, `*` stays within a segment, and all other text is literal.
 * @param {string} pattern
 * @param {string} file
 */
export function globMatch(pattern, file) {
  let re = "";
  for (let i = 0; i < pattern.length;) {
    if ((i === 0 || pattern[i - 1] === "/") && pattern.startsWith("**/", i)) {
      re += "(?:[^/]+/)*";
      i += 3;
    } else if (pattern.startsWith("**", i)) {
      re += ".*";
      i += 2;
    } else if (pattern[i] === "*") {
      re += "[^/]*";
      i++;
    } else {
      re += escapeRe(pattern[i]);
      i++;
    }
  }
  return new RegExp(`^${re}$`).test(file);
}

function escapeRe(s) {
  return s.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Validate both files. Returns all problems.
 */
export function checkPolicies(opts = {}) {
  const enums = contractEnums(opts.contractsDir);
  const sm = loadStateMachine({ file: opts.stateMachineFile, enums });
  const ap = loadApprovals({ file: opts.approvalsFile, enums });
  return { problems: [...sm.problems, ...ap.problems], stateMachine: sm.doc, approvals: ap.doc };
}
