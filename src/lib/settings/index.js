import fs from "node:fs";
import path from "node:path";
import { SETTINGS_DIR } from "../paths.js";
import * as labels from "./labels.js";
import * as rulesets from "./rulesets.js";

/**
 * Registry of reconcilable repository settings. Each module implements the
 * same interface: loadDesired, fetchActual, plan, apply, exportDesired.
 * Order matters only for apply (labels before rulesets, since neither depends
 * on the other today this is cosmetic).
 */
export const RESOURCES = /** @type {const} */ ({
  [labels.name]: labels,
  [rulesets.name]: rulesets,
});

export const RESOURCE_NAMES = Object.keys(RESOURCES);

/** Op types that represent a difference between desired and actual state. */
export const DRIFT_TYPES = new Set(["create", "update", "rename", "delete"]);

/**
 * @param {string[] | undefined} only
 * @returns {string[]}
 */
export function selectResources(only) {
  if (!only || only.length === 0) return RESOURCE_NAMES;
  for (const n of only) {
    if (!Object.hasOwn(RESOURCES, n)) {
      throw new Error(`unknown settings resource "${n}" (known: ${RESOURCE_NAMES.join(", ")})`);
    }
  }
  return RESOURCE_NAMES.filter((n) => only.includes(n));
}

/**
 * Read a desired-state file. Returns `null` when the file is absent or empty so
 * that a repo can opt in to resources incrementally.
 * @param {string} resourceName
 * @param {string} [settingsDir]
 */
export function readDesiredFile(resourceName, settingsDir = SETTINGS_DIR) {
  const file = path.join(settingsDir, RESOURCES[resourceName].file);
  if (!fs.existsSync(file)) return null;
  const text = fs.readFileSync(file, "utf8").trim();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new Error(`${file}: invalid JSON: ${err.message}`);
  }
}

/**
 * @typedef {{
 *   name: string,
 *   declared: boolean,
 *   ops: Array<{ type: string, name: string, changes: unknown[] }>,
 *   counts: Record<string, number>,
 *   drift: boolean,
 * }} ResourceReport
 */

/**
 * @typedef {{
 *   repo: import("../github.js").RepoRef,
 *   resources: ResourceReport[],
 *   drift: boolean,
 * }} PlanReport
 */

/**
 * Compute a plan for every selected resource.
 * @param {{
 *   client: import("../github.js").GitHubClient,
 *   repo: import("../github.js").RepoRef,
 *   only?: string[],
 *   settingsDir?: string,
 * }} opts
 * @returns {Promise<PlanReport>}
 */
export async function planAll({ client, repo, only, settingsDir = SETTINGS_DIR }) {
  const resources = [];
  for (const resourceName of selectResources(only)) {
    const mod = RESOURCES[resourceName];
    const raw = readDesiredFile(resourceName, settingsDir);
    if (raw === null) {
      resources.push({ name: resourceName, declared: false, ops: [], counts: {}, drift: false });
      continue;
    }
    const desired = mod.loadDesired(raw);
    const actual = await mod.fetchActual(client, repo);
    const ops = mod.plan(desired, actual);
    resources.push(summarize(resourceName, ops));
  }
  return { repo, resources, drift: resources.some((r) => r.drift) };
}

/**
 * @param {string} resourceName
 * @param {Array<{ type: string }>} ops
 * @returns {ResourceReport}
 */
export function summarize(resourceName, ops) {
  const counts = {};
  for (const op of ops) counts[op.type] = (counts[op.type] ?? 0) + 1;
  return {
    name: resourceName,
    declared: true,
    ops,
    counts,
    drift: ops.some((op) => DRIFT_TYPES.has(op.type)),
  };
}

/**
 * Plan then apply. Returns the plan plus per-op results.
 * @param {Parameters<typeof planAll>[0]} opts
 */
export async function applyAll(opts) {
  const report = await planAll(opts);
  const results = [];
  for (const r of report.resources) {
    if (!r.declared || !r.drift) continue;
    const mod = RESOURCES[r.name];
    const applied = await mod.apply(opts.client, opts.repo, r.ops);
    results.push({ name: r.name, results: applied });
  }
  return { ...report, applied: results };
}

/**
 * Snapshot live state in desired-file format.
 * @param {{ client: import("../github.js").GitHubClient, repo: import("../github.js").RepoRef, resource: string }} opts
 */
export async function exportResource({ client, repo, resource }) {
  const mod = Object.hasOwn(RESOURCES, resource) ? RESOURCES[resource] : undefined;
  if (!mod) throw new Error(`unknown settings resource "${resource}"`);
  const actual = await mod.fetchActual(client, repo);
  return mod.exportDesired(actual);
}
