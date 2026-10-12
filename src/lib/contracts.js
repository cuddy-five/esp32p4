import fs from "node:fs";
import path from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { CONTRACTS_DIR } from "./paths.js";

const SCHEMA_SUFFIX = ".schema.json";

/**
 * Loads every `*.schema.json` in a directory into a single Ajv instance so that
 * cross-file `$ref`s resolve, and exposes validation keyed by contract kind.
 *
 * Contract kind is derived from the file name (`task.schema.json` -> `task`).
 * `common.schema.json` is a definitions-only file and is not a contract kind.
 */
export class ContractRegistry {
  /** @param {{ dir?: string }} [opts] */
  constructor({ dir = CONTRACTS_DIR } = {}) {
    this.dir = dir;
    this.ajv = new Ajv2020({
      allErrors: true,
      strict: true,
      allowUnionTypes: true,
      verbose: false,
    });
    addFormats(this.ajv);
    /** @type {Map<string, { id: string, file: string, schema: object }>} */
    this.kinds = new Map();
    this.#load();
  }

  #load() {
    const files = fs
      .readdirSync(this.dir)
      .filter((f) => f.endsWith(SCHEMA_SUFFIX))
      .sort();
    if (files.length === 0) {
      throw new Error(`no contract schemas found in ${this.dir}`);
    }
    for (const file of files) {
      const full = path.join(this.dir, file);
      const schema = JSON.parse(fs.readFileSync(full, "utf8"));
      if (typeof schema.$id !== "string") {
        throw new Error(`${file}: schema is missing $id`);
      }
      this.ajv.addSchema(schema);
      const kind = file.slice(0, -SCHEMA_SUFFIX.length);
      if (kind !== "common") {
        this.kinds.set(kind, { id: schema.$id, file: full, schema });
      }
    }
    // Compile eagerly so schema authoring mistakes surface at load time, not on first use.
    for (const { id } of this.kinds.values()) {
      const v = this.ajv.getSchema(id);
      if (!v) throw new Error(`failed to compile schema ${id}`);
    }
  }

  /** @returns {string[]} contract kinds, sorted */
  list() {
    return [...this.kinds.keys()].sort();
  }

  /** @param {string} kind */
  has(kind) {
    return this.kinds.has(kind);
  }

  /** @param {string} kind */
  schemaFor(kind) {
    const entry = this.kinds.get(kind);
    if (!entry) {
      throw new Error(`unknown contract kind "${kind}" (known: ${this.list().join(", ")})`);
    }
    return entry.schema;
  }

  /**
   * Infer the contract kind of a document from its `contract` field.
   * @param {unknown} doc
   * @returns {string | undefined}
   */
  inferKind(doc) {
    if (doc && typeof doc === "object" && typeof doc.contract === "string") {
      return doc.contract;
    }
    return undefined;
  }

  /**
   * Validate a parsed document.
   * @param {unknown} doc
   * @param {{ kind?: string }} [opts] explicit kind; otherwise inferred from `doc.contract`
   * @returns {{ ok: boolean, kind: string | undefined, errors: ValidationError[] }}
   */
  validate(doc, { kind } = {}) {
    const resolved = kind ?? this.inferKind(doc);
    if (!resolved) {
      return {
        ok: false,
        kind: undefined,
        errors: [
          {
            path: "/contract",
            keyword: "required",
            message: "document has no `contract` field and no --kind was given",
          },
        ],
      };
    }
    if (!this.kinds.has(resolved)) {
      return {
        ok: false,
        kind: resolved,
        errors: [
          {
            path: "/contract",
            keyword: "enum",
            message: `unknown contract kind "${resolved}" (known: ${this.list().join(", ")})`,
          },
        ],
      };
    }
    const validate = this.ajv.getSchema(this.kinds.get(resolved).id);
    const ok = validate(doc);
    return { ok, kind: resolved, errors: ok ? [] : normalizeErrors(validate.errors) };
  }
}

/**
 * @typedef {{ path: string, keyword: string, message: string, params?: object }} ValidationError
 */

/**
 * Collapse Ajv's error objects into stable, human-readable records and drop the
 * noise that `unevaluatedProperties` + `allOf` produces (one error per branch).
 * @param {import("ajv").ErrorObject[] | null | undefined} errors
 * @returns {ValidationError[]}
 */
export function normalizeErrors(errors) {
  if (!errors) return [];
  const seen = new Set();
  const out = [];
  for (const e of errors) {
    let p = e.instancePath || "";
    let message = e.message ?? e.keyword;
    if (e.keyword === "additionalProperties" || e.keyword === "unevaluatedProperties") {
      const prop = e.params?.additionalProperty ?? e.params?.unevaluatedProperty;
      p = `${p}/${prop}`;
      message = "property is not allowed by the contract";
    } else if (e.keyword === "required") {
      p = `${p}/${e.params.missingProperty}`;
      message = "required property is missing";
    } else if (e.keyword === "const") {
      message = `must equal ${JSON.stringify(e.params.allowedValue)}`;
    } else if (e.keyword === "enum") {
      message = `must be one of: ${e.params.allowedValues.join(", ")}`;
    }
    const key = `${p}|${e.keyword}|${message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ path: p || "/", keyword: e.keyword, message, params: e.params });
  }
  return out.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

/**
 * Read and validate a JSON file from disk.
 * @param {ContractRegistry} registry
 * @param {string} file
 * @param {{ kind?: string }} [opts]
 */
export function validateFile(registry, file, opts = {}) {
  let doc;
  try {
    doc = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (err) {
    return {
      file,
      ok: false,
      kind: opts.kind,
      errors: [{ path: "/", keyword: "parse", message: `invalid JSON: ${err.message}` }],
    };
  }
  return { file, ...registry.validate(doc, opts) };
}
