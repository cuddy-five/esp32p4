import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { CONTROL_PLANE_DIR, CONTRACTS_DIR, normalizeRepoPath } from "./paths.js";

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
const isMapping = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

/** Parse a policy file; a document that is not a mapping is reported, not thrown. */
function readMapping(file, p) {
  const parsed = YAML.parse(fs.readFileSync(file, "utf8"));
  if (isMapping(parsed)) return parsed;
  p("/", "document must be a YAML mapping");
  return {};
}

/**
 * Load and validate the task state machine.
 * @param {{ file?: string, enums?: ReturnType<typeof contractEnums> }} [opts]
 * @returns {{ doc: any, problems: Problem[] }}
 */
export function loadStateMachine({ file = STATE_MACHINE_FILE, enums = contractEnums() } = {}) {
  const problems = [];
  const p = (pth, message) => problems.push({ file, path: pth, message });
  const doc = readMapping(file, p);

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
    for (const g of asArray(t.gates)) if (!Object.hasOwn(gates, g)) p(`/transitions/${i}/gates`, `gate "${g}" is not defined`);
    for (const f of froms) for (const to of tos) edges.push({ from: f, to, actors, gates: asArray(t.gates), index: i });
  });
  const usedGates = new Set(edges.flatMap((e) => e.gates));
  for (const g of Object.keys(gates)) if (!usedGates.has(g)) p(`/gates/${g}`, "is defined but no transition uses it");

  // Reachability: every state reachable from initial; every non-terminal state can reach a terminal.
  const reachable = closure(doc.initial, edges, (e) => e.from, (e) => e.to);
  for (const s of states) if (!reachable.has(s)) p(`/states/${s}`, "unreachable from initial");
  const canFinish = new Set();
  for (const t of terminal) for (const s of closure(t, edges, (e) => e.to, (e) => e.from)) canFinish.add(s);
  for (const s of states) if (!terminal.has(s) && !canFinish.has(s)) p(`/states/${s}`, "cannot reach a terminal state");

  // Separation of duties: human-owned states are left only by humans, except into blocked.
  for (const e of edges) {
    const owner = doc.states?.[e.from]?.owner;
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
    // Every merge is a human decision, whatever state precedes it.
    if (e.to === "done" && e.actors.some((actor) => actor !== "human")) {
      p(`/transitions/${e.index}`, `only humans may move a task into done (from "${e.from}")`);
    }
    // The producer of a change may not complete its review or merge it.
    if (e.actors.includes("implementer") && ["verifying", "done"].includes(e.to)) {
      p(`/transitions/${e.index}`, `implementer may not move a task into "${e.to}"`);
    }
  }

  // Mandatory gates: no route from the initial state may reach the target while skipping a listed gate.
  const mandatory = doc.mandatory_gates ?? {};
  if (!isMapping(mandatory)) p("/mandatory_gates", "must map target states to gate lists");
  for (const [target, required] of Object.entries(isMapping(mandatory) ? mandatory : {})) {
    if (!stateSet.has(target)) p(`/mandatory_gates/${target}`, `"${target}" is not a defined state`);
    for (const g of asArray(required)) {
      if (!Object.hasOwn(gates, g)) {
        p(`/mandatory_gates/${target}`, `gate "${g}" is not defined`);
        continue;
      }
      const bypass = closure(doc.initial, edges.filter((e) => !e.gates.includes(g)), (e) => e.from, (e) => e.to);
      if (bypass.has(target)) p(`/mandatory_gates/${target}`, `"${target}" is reachable without gate "${g}"`);
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
  const problems = [];
  const p = (pth, message) => problems.push({ file, path: pth, message });
  const doc = readMapping(file, p);

  const stages = Object.keys(doc.stages ?? {});
  if (stages.length === 0) p("/stages", "at least one stage is required");
  const stageSet = new Set(stages);

  const byRisk = isMapping(doc.by_risk) ? doc.by_risk : {};
  for (const level of enums.riskLevels) {
    if (!Object.hasOwn(byRisk, level)) p(`/by_risk/${level}`, "missing policy for this risk level");
  }
  for (const [level, rule] of Object.entries(byRisk)) {
    if (!enums.riskLevels.includes(level)) p(`/by_risk/${level}`, "not a risk_level value");
    for (const s of asArray(rule?.human_stages)) if (!stageSet.has(s)) p(`/by_risk/${level}/human_stages`, `"${s}" is not a defined stage`);
    for (const r of asArray(rule?.required_reviews)) if (!enums.reviewKinds.includes(r)) p(`/by_risk/${level}/required_reviews`, `"${r}" is not a review_kind`);
    if (!["optional", "required"].includes(rule?.security_review)) p(`/by_risk/${level}/security_review`, "must be optional or required");
    // The two fields describe one decision and must not disagree.
    if ((rule?.security_review === "required") !== asArray(rule?.required_reviews).includes("security")) {
      p(`/by_risk/${level}/security_review`, `"${rule?.security_review}" disagrees with required_reviews`);
    }
  }
  // The security auditor may never be skipped from medium risk upwards (AGENTS.md roles).
  const mediumIndex = enums.riskLevels.indexOf("medium");
  if (mediumIndex !== -1) {
    for (const level of enums.riskLevels.slice(mediumIndex)) {
      if (Object.hasOwn(byRisk, level) && byRisk[level]?.security_review !== "required") {
        p(`/by_risk/${level}/security_review`, "must be required at medium risk and above");
      }
    }
  }
  // Monotonic: higher risk never requires fewer human stages or review kinds than lower risk.
  const order = enums.riskLevels;
  for (let i = 1; i < order.length; i++) {
    for (const key of ["human_stages", "required_reviews"]) {
      const lo = new Set(asArray(byRisk[order[i - 1]]?.[key]));
      const hi = new Set(asArray(byRisk[order[i]]?.[key]));
      const what = key === "human_stages" ? "stage" : "review";
      for (const s of lo) if (!hi.has(s)) p(`/by_risk/${order[i]}/${key}`, `drops ${what} "${s}" required at ${order[i - 1]}`);
    }
  }

  asArray(doc.always_human).forEach((rule, i) => {
    if (!rule?.id) p(`/always_human/${i}/id`, "missing");
    if (asArray(rule?.paths).length === 0 && asArray(rule?.tags).length === 0) p(`/always_human/${i}`, "needs paths or tags");
    for (const t of asArray(rule?.tags)) if (!enums.riskTags.includes(t)) p(`/always_human/${i}/tags`, `"${t}" is not a task risk tag`);
    for (const s of asArray(rule?.stages)) if (!stageSet.has(s)) p(`/always_human/${i}/stages`, `"${s}" is not a defined stage`);
    if (asArray(rule?.stages).length === 0) p(`/always_human/${i}/stages`, "missing");
    for (const g of asArray(rule?.paths)) {
      if (typeof g !== "string" || g.startsWith("/")) p(`/always_human/${i}/paths`, `"${g}" must be repository-relative`);
      // Changed paths are normalized, so these spellings would silently never match.
      else if (/^\.\/|\/\/|(^|\/)\.\.?(\/|$)/.test(g)) p(`/always_human/${i}/paths`, `"${g}" must not contain ./, // or .. segments`);
    }
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
  const byRisk = approvals.by_risk ?? {};
  const stages = new Set(Object.hasOwn(byRisk, risk.level) ? asArray(byRisk[risk.level]?.human_stages) : []);
  const reasons = [];
  if (stages.size) reasons.push(`risk level ${risk.level}`);
  const cleanPaths = paths.map(normalizeRepoPath);
  for (const rule of asArray(approvals.always_human)) {
    const tagHit = asArray(rule.tags).some((t) => asArray(risk.tags).includes(t));
    const pathHit = asArray(rule.paths).some((g) =>
      cleanPaths.some((f) => globMatch(g, f) || globMatch(f, g)),
    );
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
 *
 * Matching is a dynamic program over (pattern token, file offset), so its cost is
 * linear in both lengths. A backtracking regex was exponential for inputs with many
 * stars, and its `.` silently skipped line terminators that `[^/]` accepted.
 * @param {string} pattern
 * @param {string} file
 */
export function globMatch(pattern, file) {
  const tokens = compileGlob(pattern);
  const n = file.length;
  const nextSlash = new Int32Array(n + 1).fill(-1);
  for (let j = n - 1; j >= 0; j--) nextSlash[j] = file[j] === "/" ? j : nextSlash[j + 1];
  // next[j] holds whether tokens[i + 1..] match file[j..]; the empty suffix matches only the end.
  let next = new Uint8Array(n + 1);
  next[n] = 1;
  for (let i = tokens.length - 1; i >= 0; i--) {
    const cur = new Uint8Array(n + 1);
    const t = tokens[i];
    for (let j = n; j >= 0; j--) {
      if (t.kind === "literal") cur[j] = j < n && file[j] === t.char && next[j + 1] ? 1 : 0;
      else if (t.kind === "star") cur[j] = next[j] || (j < n && file[j] !== "/" && cur[j + 1]) ? 1 : 0;
      else if (t.kind === "globstar") cur[j] = next[j] || (j < n && cur[j + 1]) ? 1 : 0;
      else {
        // "dirs": zero or more non-empty segments, each followed by a slash.
        const slash = j < n ? nextSlash[j] : -1;
        cur[j] = next[j] || (slash > j && cur[slash + 1]) ? 1 : 0;
      }
    }
    next = cur;
  }
  return next[0] === 1;
}

/** @param {string} pattern */
function compileGlob(pattern) {
  const tokens = [];
  for (let i = 0; i < pattern.length;) {
    if ((i === 0 || pattern[i - 1] === "/") && pattern.startsWith("**/", i)) {
      tokens.push({ kind: "dirs" });
      i += 3;
    } else if (pattern.startsWith("**", i)) {
      tokens.push({ kind: "globstar" });
      i += 2;
    } else if (pattern[i] === "*") {
      tokens.push({ kind: "star" });
      i++;
    } else {
      tokens.push({ kind: "literal", char: pattern[i] });
      i++;
    }
  }
  return tokens;
}

/**
 * Validate both files. Returns all problems.
 */
export function checkPolicies(opts = {}) {
  const enums = contractEnums(opts.contractsDir);
  const sm = loadStateMachine({ file: opts.stateMachineFile, enums });
  const ap = loadApprovals({ file: opts.approvalsFile, enums });
  const cross = crossCheck(sm, ap, opts.approvalsFile ?? APPROVALS_FILE);
  return { problems: [...sm.problems, ...ap.problems, ...cross], stateMachine: sm.doc, approvals: ap.doc };
}

/** Review gates that the state machine makes mandatory need a matching review kind at every risk level. */
const GATE_REVIEW_KIND = { reviews_approve: "code", verification_passed: "verification" };

function crossCheck(sm, ap, approvalsFile) {
  const problems = [];
  const required = new Set(asArray(isMapping(sm.doc.mandatory_gates) ? sm.doc.mandatory_gates.done : undefined));
  const byRisk = isMapping(ap.doc.by_risk) ? ap.doc.by_risk : {};
  for (const [gate, kind] of Object.entries(GATE_REVIEW_KIND)) {
    if (!required.has(gate)) continue;
    for (const [level, rule] of Object.entries(byRisk)) {
      if (!asArray(rule?.required_reviews).includes(kind)) {
        problems.push({
          file: approvalsFile,
          path: `/by_risk/${level}/required_reviews`,
          message: `must include "${kind}" because the state machine requires gate "${gate}" before done`,
        });
      }
    }
  }
  return problems;
}
