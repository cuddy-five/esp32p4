import { diff } from "../diff.js";

/**
 * Labels resource.
 *
 * Desired-state file shape (`settings/labels.json`):
 * {
 *   "version": 1,
 *   "prune": false,                 // delete labels not declared here
 *   "labels": [
 *     { "name": "cp:task", "color": "0E8A16", "description": "...", "aliases": ["task"] }
 *   ]
 * }
 *
 * Names are matched case-insensitively because GitHub enforces case-insensitive
 * uniqueness. `aliases` lets an existing label be renamed into the declared
 * name instead of being deleted and recreated (which would strip it from issues).
 */

export const name = "labels";
export const file = "labels.json";

const COLOR_RE = /^[0-9a-f]{6}$/;

/**
 * @typedef {{ name: string, color: string, description: string, aliases: string[] }} Label
 */

/**
 * @param {unknown} json parsed desired-state file
 * @returns {{ prune: boolean, labels: Label[] }}
 */
export function loadDesired(json) {
  if (!json || typeof json !== "object" || !Array.isArray(json.labels)) {
    throw new Error("labels.json must be an object with a `labels` array");
  }
  const seen = new Map();
  const labels = json.labels.map((raw, i) => {
    if (!raw || typeof raw !== "object" || typeof raw.name !== "string" || !raw.name.trim()) {
      throw new Error(`labels[${i}]: missing name`);
    }
    const label = normalizeLabel(raw);
    if (!COLOR_RE.test(label.color)) {
      throw new Error(`labels[${i}] "${label.name}": color must be 6 hex digits, got "${raw.color}"`);
    }
    const key = label.name.toLowerCase();
    if (seen.has(key)) {
      throw new Error(`labels[${i}] "${label.name}": duplicates labels[${seen.get(key)}] (names are case-insensitive)`);
    }
    seen.set(key, i);
    return label;
  });
  for (const l of labels) {
    for (const alias of l.aliases) {
      if (seen.has(alias.toLowerCase())) {
        throw new Error(`label "${l.name}": alias "${alias}" is also a declared label name`);
      }
    }
  }
  return { prune: json.prune === true, labels };
}

/**
 * @param {{ name: string, color?: string, description?: string | null, aliases?: string[] }} raw
 * @returns {Label}
 */
export function normalizeLabel(raw) {
  return {
    name: raw.name.trim(),
    color: String(raw.color ?? "ededed").replace(/^#/, "").toLowerCase(),
    description: (raw.description ?? "").trim(),
    aliases: Array.isArray(raw.aliases) ? raw.aliases.map((a) => String(a).trim()) : [],
  };
}

/**
 * @param {import("../github.js").GitHubClient} client
 * @param {import("../github.js").RepoRef} repo
 * @returns {Promise<Label[]>}
 */
export async function fetchActual(client, repo) {
  const raw = await client.paginate(`/repos/${repo.owner}/${repo.name}/labels`);
  return raw.map((l) => normalizeLabel({ name: l.name, color: l.color, description: l.description }));
}

/**
 * @typedef {{
 *   type: "create" | "update" | "rename" | "delete" | "unmanaged" | "noop",
 *   name: string,
 *   from?: string,
 *   before?: Partial<Label>,
 *   after?: Partial<Label>,
 *   changes: import("../diff.js").Change[],
 * }} LabelOp
 */

/**
 * Pure planning function.
 * @param {{ prune: boolean, labels: Label[] }} desired
 * @param {Label[]} actual
 * @returns {LabelOp[]}
 */
export function plan(desired, actual) {
  /** @type {LabelOp[]} */
  const ops = [];
  const actualByKey = new Map(actual.map((l) => [l.name.toLowerCase(), l]));
  const consumed = new Set();

  for (const d of desired.labels) {
    const key = d.name.toLowerCase();
    const match = actualByKey.get(key);
    if (match) {
      consumed.add(key);
      const changes = diff(comparable(d), comparable(match));
      ops.push(
        changes.length === 0
          ? { type: "noop", name: d.name, changes: [] }
          : { type: "update", name: d.name, before: comparable(match), after: comparable(d), changes },
      );
      continue;
    }
    const aliasKey = d.aliases.map((a) => a.toLowerCase()).find((a) => actualByKey.has(a) && !consumed.has(a));
    if (aliasKey) {
      consumed.add(aliasKey);
      const source = actualByKey.get(aliasKey);
      ops.push({
        type: "rename",
        name: d.name,
        from: source.name,
        before: comparable(source),
        after: comparable(d),
        changes: [{ path: "/name", from: source.name, to: d.name }, ...diff(comparable(d), comparable(source))],
      });
      continue;
    }
    ops.push({ type: "create", name: d.name, after: comparable(d), changes: diff(comparable(d), {}) });
  }

  for (const a of actual) {
    const key = a.name.toLowerCase();
    if (consumed.has(key)) continue;
    ops.push(
      desired.prune
        ? { type: "delete", name: a.name, before: comparable(a), changes: diff({}, comparable(a)) }
        : { type: "unmanaged", name: a.name, before: comparable(a), changes: [] },
    );
  }
  return ops;
}

function comparable(l) {
  return { name: l.name, color: l.color, description: l.description };
}

/**
 * Execute a plan. Idempotent with respect to re-running after partial failure.
 * @param {import("../github.js").GitHubClient} client
 * @param {import("../github.js").RepoRef} repo
 * @param {LabelOp[]} ops
 * @returns {Promise<Array<{ op: LabelOp, status: "applied" | "skipped" }>>}
 */
export async function apply(client, repo, ops) {
  const base = `/repos/${repo.owner}/${repo.name}/labels`;
  const results = [];
  for (const op of ops) {
    switch (op.type) {
      case "create":
        await client.request("POST", base, {
          body: { name: op.after.name, color: op.after.color, description: op.after.description },
        });
        results.push({ op, status: "applied" });
        break;
      case "update":
        await client.request("PATCH", `${base}/${encodeURIComponent(op.before.name)}`, {
          body: { new_name: op.after.name, color: op.after.color, description: op.after.description },
        });
        results.push({ op, status: "applied" });
        break;
      case "rename":
        await client.request("PATCH", `${base}/${encodeURIComponent(op.from)}`, {
          body: { new_name: op.after.name, color: op.after.color, description: op.after.description },
        });
        results.push({ op, status: "applied" });
        break;
      case "delete":
        await client.request("DELETE", `${base}/${encodeURIComponent(op.name)}`);
        results.push({ op, status: "applied" });
        break;
      default:
        results.push({ op, status: "skipped" });
    }
  }
  return results;
}

/**
 * Render the live state as a desired-state file, for bootstrapping a repo.
 * @param {Label[]} actual
 */
export function exportDesired(actual) {
  return {
    version: 1,
    prune: false,
    labels: [...actual]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((l) => ({ name: l.name, color: l.color, description: l.description })),
  };
}
