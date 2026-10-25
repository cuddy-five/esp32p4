import { diff, stripNullish } from "../diff.js";

/**
 * Repository rulesets resource.
 *
 * Desired-state file shape (`settings/rulesets.json`):
 * {
 *   "version": 1,
 *   "prune": false,                  // delete rulesets not declared here
 *   "comparison": "declared",        // "declared" (default) or "strict"
 *   "rulesets": [
 *     {
 *       "name": "protect-default-branch",
 *       "target": "branch",
 *       "enforcement": "active",
 *       "conditions": { "ref_name": { "include": ["~DEFAULT_BRANCH"], "exclude": [] } },
 *       "rules": [ { "type": "deletion" }, ... ],
 *       "bypass_actors": []
 *     }
 *   ]
 * }
 *
 * Each ruleset body mirrors the REST representation accepted by
 * POST/PUT /repos/{owner}/{repo}/rulesets, so `settings export` output can be
 * committed verbatim. Rulesets are keyed by `name`.
 *
 * In `declared` mode only the fields you declare are compared; GitHub-populated
 * defaults (for example `pull_request.parameters.allowed_merge_methods`) are
 * tolerated unless you declare them.
 */

export const name = "rulesets";
export const file = "rulesets.json";

const SERVER_FIELDS = new Set([
  "id",
  "node_id",
  "source",
  "source_type",
  "created_at",
  "updated_at",
  "current_user_can_bypass",
  "_links",
]);

const TARGETS = new Set(["branch", "tag", "push"]);
const ENFORCEMENTS = new Set(["active", "disabled", "evaluate"]);

/**
 * @typedef {{
 *   name: string,
 *   target: string,
 *   enforcement: string,
 *   conditions?: object,
 *   rules?: object[],
 *   bypass_actors?: object[],
 * }} Ruleset
 */

/**
 * @param {unknown} json
 * @returns {{ prune: boolean, mode: "declared" | "strict", rulesets: Ruleset[] }}
 */
export function loadDesired(json) {
  if (!json || typeof json !== "object" || !Array.isArray(json.rulesets)) {
    throw new Error("rulesets.json must be an object with a `rulesets` array");
  }
  const mode = json.comparison ?? "declared";
  if (mode !== "declared" && mode !== "strict") {
    throw new Error(`rulesets.json: comparison must be "declared" or "strict", got "${mode}"`);
  }
  const seen = new Set();
  const rulesets = json.rulesets.map((raw, i) => {
    if (!raw || typeof raw !== "object" || typeof raw.name !== "string" || !raw.name.trim()) {
      throw new Error(`rulesets[${i}]: missing name`);
    }
    if (!TARGETS.has(raw.target)) {
      throw new Error(`rulesets[${i}] "${raw.name}": target must be one of ${[...TARGETS].join(", ")}`);
    }
    if (!ENFORCEMENTS.has(raw.enforcement)) {
      throw new Error(`rulesets[${i}] "${raw.name}": enforcement must be one of ${[...ENFORCEMENTS].join(", ")}`);
    }
    if (!Array.isArray(raw.rules)) {
      throw new Error(`rulesets[${i}] "${raw.name}": rules must be an array`);
    }
    if (seen.has(raw.name)) {
      throw new Error(`rulesets[${i}] "${raw.name}": duplicate ruleset name`);
    }
    seen.add(raw.name);
    return normalizeRuleset(raw);
  });
  return { prune: json.prune === true, mode, rulesets };
}

/**
 * Strip server-populated fields and nulls so desired and actual share a shape.
 * @param {object} raw
 * @returns {Ruleset}
 */
export function normalizeRuleset(raw) {
  const out = {};
  for (const [k, v] of Object.entries(raw)) {
    if (SERVER_FIELDS.has(k)) continue;
    out[k] = v;
  }
  if (out.bypass_actors === undefined) out.bypass_actors = [];
  return stripNullish(out);
}

/**
 * The list endpoint omits rules and conditions, so each ruleset is fetched by id.
 * @param {import("../github.js").GitHubClient} client
 * @param {import("../github.js").RepoRef} repo
 * @returns {Promise<Array<Ruleset & { id: number }>>}
 */
export async function fetchActual(client, repo) {
  const base = `/repos/${repo.owner}/${repo.name}/rulesets`;
  const summaries = await client.paginate(base, { params: { includes_parents: "false" } });
  const full = [];
  for (const s of summaries) {
    const { data } = await client.request("GET", `${base}/${s.id}`);
    full.push({ ...normalizeRuleset(data), id: data.id });
  }
  return full;
}

/**
 * @typedef {{
 *   type: "create" | "update" | "delete" | "unmanaged" | "noop",
 *   name: string,
 *   id?: number,
 *   before?: Ruleset,
 *   after?: Ruleset,
 *   changes: import("../diff.js").Change[],
 * }} RulesetOp
 */

/**
 * Pure planning function.
 * @param {{ prune: boolean, mode: "declared" | "strict", rulesets: Ruleset[] }} desired
 * @param {Array<Ruleset & { id: number }>} actual
 * @returns {RulesetOp[]}
 */
export function plan(desired, actual) {
  const actualByName = new Map();
  for (const ruleset of actual) {
    const existing = actualByName.get(ruleset.name);
    if (existing) {
      throw new Error(`duplicate live ruleset name "${ruleset.name}" (IDs ${existing.id}, ${ruleset.id}); resolve the name collision before reconciling settings`);
    }
    actualByName.set(ruleset.name, ruleset);
  }
  /** @type {RulesetOp[]} */
  const ops = [];
  const consumed = new Set();

  for (const d of desired.rulesets) {
    const match = actualByName.get(d.name);
    if (!match) {
      ops.push({ type: "create", name: d.name, after: d, changes: diff(d, {}, { mode: "strict" }) });
      continue;
    }
    consumed.add(d.name);
    const { id, ...actualBody } = match;
    const changes = diff(d, actualBody, { mode: desired.mode });
    ops.push(
      changes.length === 0
        ? { type: "noop", name: d.name, id, changes: [] }
        : { type: "update", name: d.name, id, before: actualBody, after: d, changes },
    );
  }

  for (const a of actual) {
    if (consumed.has(a.name)) continue;
    const { id, ...body } = a;
    ops.push(
      desired.prune
        ? { type: "delete", name: a.name, id, before: body, changes: diff({}, body, { mode: "strict" }) }
        : { type: "unmanaged", name: a.name, id, before: body, changes: [] },
    );
  }
  return ops;
}

/**
 * @param {import("../github.js").GitHubClient} client
 * @param {import("../github.js").RepoRef} repo
 * @param {RulesetOp[]} ops
 */
export async function apply(client, repo, ops) {
  const base = `/repos/${repo.owner}/${repo.name}/rulesets`;
  const results = [];
  for (const op of ops) {
    switch (op.type) {
      case "create":
        await client.request("POST", base, { body: op.after });
        results.push({ op, status: "applied" });
        break;
      case "update":
        // PUT replaces the whole ruleset, so in `declared` mode undeclared
        // fields fall back to GitHub defaults. That is the intended contract:
        // what is not declared is not managed.
        await client.request("PUT", `${base}/${op.id}`, { body: op.after });
        results.push({ op, status: "applied" });
        break;
      case "delete":
        await client.request("DELETE", `${base}/${op.id}`);
        results.push({ op, status: "applied" });
        break;
      default:
        results.push({ op, status: "skipped" });
    }
  }
  return results;
}

/**
 * @param {Array<Ruleset & { id?: number }>} actual
 */
export function exportDesired(actual) {
  return {
    version: 1,
    prune: false,
    comparison: "declared",
    rulesets: [...actual]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(({ id, ...body }) => body),
  };
}
