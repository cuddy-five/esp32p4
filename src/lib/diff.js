/**
 * Structural comparison helpers used by settings reconciliation.
 *
 * Two comparison modes exist because GitHub's API decorates resources with
 * server-populated defaults that operators rarely want to declare:
 *
 * - `strict`: desired and actual must be structurally identical.
 * - `declared`: only keys present in desired are compared; extra keys on the
 *   actual resource are tolerated. Arrays are compared element-wise after
 *   canonical sorting, so order is not significant.
 */

const isPlainObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

/**
 * Deterministic JSON string: object keys sorted, arrays preserved in order.
 * @param {unknown} value
 */
export function canonicalize(value) {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (isPlainObject(value)) {
    const out = {};
    for (const k of Object.keys(value).sort()) {
      if (value[k] === undefined) continue;
      out[k] = sortKeys(value[k]);
    }
    return out;
  }
  return value;
}

/**
 * Remove keys whose value is `null` or `undefined`, recursively.
 * @template T
 * @param {T} value
 * @returns {T}
 */
export function stripNullish(value) {
  if (Array.isArray(value)) return value.map(stripNullish);
  if (isPlainObject(value)) {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (v === null || v === undefined) continue;
      out[k] = stripNullish(v);
    }
    return out;
  }
  return value;
}

/**
 * Sort an array of objects by a stable key so that order-insensitive
 * collections (rules, bypass actors) compare deterministically.
 * @param {unknown[]} arr
 * @param {(item: any) => string} [keyFn]
 */
export function sortCollection(arr, keyFn = canonicalize) {
  return [...arr].sort((a, b) => {
    const ka = keyFn(a);
    const kb = keyFn(b);
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  });
}

/**
 * @typedef {{ path: string, from: unknown, to: unknown }} Change
 *   `from` is the actual (current) value, `to` is the desired value.
 */

/**
 * Compute the list of changes needed to move `actual` to `desired`.
 * @param {unknown} desired
 * @param {unknown} actual
 * @param {{ mode?: "strict" | "declared", path?: string }} [opts]
 * @returns {Change[]}
 */
export function diff(desired, actual, { mode = "strict", path = "" } = {}) {
  /** @type {Change[]} */
  const changes = [];
  walk(desired, actual, path, mode, changes);
  return changes;
}

function walk(desired, actual, path, mode, changes) {
  if (isPlainObject(desired) && isPlainObject(actual)) {
    const keys = new Set(Object.keys(desired));
    if (mode === "strict") for (const k of Object.keys(actual)) keys.add(k);
    for (const k of [...keys].sort()) {
      const d = desired[k];
      const a = actual[k];
      const p = `${path}/${k}`;
      if (d === undefined && a !== undefined) {
        changes.push({ path: p, from: a, to: undefined });
      } else if (a === undefined && d !== undefined) {
        changes.push({ path: p, from: undefined, to: d });
      } else {
        walk(d, a, p, mode, changes);
      }
    }
    return;
  }
  if (Array.isArray(desired) && Array.isArray(actual)) {
    const ds = sortCollection(desired);
    const as = sortCollection(actual);
    if (ds.length !== as.length) {
      changes.push({ path, from: actual, to: desired });
      return;
    }
    // After sorting, element-wise comparison is only meaningful when elements
    // are scalars or structurally identical in `strict` mode. In `declared`
    // mode, objects may carry extra keys on the actual side, so canonical
    // sort keys would diverge; fall back to matching each desired element to
    // the first unmatched actual element it is a subset of.
    if (mode === "declared" && ds.some(isPlainObject)) {
      const unmatched = [...as];
      for (const d of ds) {
        const idx = unmatched.findIndex((a) => diff(d, a, { mode }).length === 0);
        if (idx === -1) {
          changes.push({ path, from: actual, to: desired });
          return;
        }
        unmatched.splice(idx, 1);
      }
      return;
    }
    for (let i = 0; i < ds.length; i++) {
      walk(ds[i], as[i], `${path}/${i}`, mode, changes);
    }
    return;
  }
  if (canonicalize(desired) !== canonicalize(actual)) {
    changes.push({ path: path || "/", from: actual, to: desired });
  }
}
