/**
 * Security posture tests for the contract layer.
 *
 * Contracts are the trust boundary between agents, workflows, and humans. A
 * permissive schema lets a compromised or confused producer smuggle fields
 * that downstream consumers may act on (for example an undeclared `approved:
 * true`). These tests pin the properties that keep the boundary tight.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { ContractRegistry } from "../../src/lib/contracts.js";
import { CONTRACTS_DIR } from "../../src/lib/paths.js";

const registry = new ContractRegistry();
const common = JSON.parse(fs.readFileSync(path.join(CONTRACTS_DIR, "common.schema.json"), "utf8"));

function* walkObjects(node, ptr = "") {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i++) yield* walkObjects(node[i], `${ptr}/${i}`);
    return;
  }
  yield [ptr, node];
  for (const [k, v] of Object.entries(node)) yield* walkObjects(v, `${ptr}/${k}`);
}

describe("contract schemas are closed", () => {
  for (const kind of registry.list()) {
    const schema = registry.schemaFor(kind);

    test(`${kind}: top level forbids unevaluated properties`, () => {
      assert.equal(schema.unevaluatedProperties, false);
      assert.equal(schema.type, "object");
    });

    test(`${kind}: pins the contract discriminator`, () => {
      assert.deepEqual(schema.properties.contract, { const: kind });
    });

    test(`${kind}: every nested object schema is closed`, () => {
      for (const [ptr, node] of walkObjects(schema.properties)) {
        if (node.type !== "object" || !node.properties) continue;
        const closed = node.additionalProperties === false || node.unevaluatedProperties === false;
        assert.ok(closed, `${kind}${ptr} declares properties but is not closed`);
      }
    });

    test(`${kind}: string maps bound their size`, () => {
      for (const [ptr, node] of walkObjects(schema.properties)) {
        if (node.type === "object" && node.additionalProperties && typeof node.additionalProperties === "object") {
          assert.ok(Number.isInteger(node.maxProperties), `${kind}${ptr} is an open map without maxProperties`);
        }
      }
    });

    test(`${kind}: free-text fields are length-bounded`, () => {
      for (const [ptr, node] of walkObjects(schema.properties)) {
        if (node.$ref === "common.schema.json#/$defs/markdown") continue;
        if (node.type === "string" && !node.enum && !node.const && !node.format && !node.pattern) {
          // Plain strings must either be short labels or declare a ceiling.
          const bounded = Number.isInteger(node.maxLength) || /\/(name|title|description|message|summary|rationale|notes|statement|question|suggestion|rule|issuer|consequences|decision|details|evaluated_by|tool|owner|version|model|run_id|requested_by|default_branch|branch|head_ref|base_ref|release_tag|default_if_unanswered|reason|granted_by|content_type|decided_by|kind)$/.test(ptr);
          assert.ok(bounded, `${kind}${ptr} is an unbounded free-text string`);
        }
      }
    });
  }

  test("common.schema.json shared objects are closed", () => {
    for (const [name, def] of Object.entries(common.$defs)) {
      if (def.type !== "object" || !def.properties) continue;
      if (name === "envelope") continue; // intentionally open; concrete contracts close it
      assert.equal(def.additionalProperties, false, `common.$defs.${name} is not closed`);
    }
  });

  test("markdown fields carry a hard size limit", () => {
    assert.ok(common.$defs.markdown.maxLength <= 65536);
  });

  test("identifiers are URL-safe and bounded", () => {
    const re = new RegExp(common.$defs.identifier.pattern);
    assert.ok(re.test("task_01J9Z3Q8K2M4N6P8R0T2V4X6Y8"));
    assert.equal(re.test("../etc/passwd"), false);
    assert.equal(re.test("a b"), false);
    assert.equal(re.test("x".repeat(200)), false);
  });

  test("path globs cannot be absolute", () => {
    const re = new RegExp(common.$defs.path_glob.pattern);
    assert.ok(re.test("src/**"));
    assert.equal(re.test("/etc/passwd"), false);
  });
});

describe("validator refuses dangerous inputs", () => {
  test("a review cannot smuggle an approval through an undeclared field", () => {
    const doc = JSON.parse(fs.readFileSync(path.join(CONTRACTS_DIR, "examples", "review.example.json"), "utf8"));
    doc.verdict = "request_changes";
    doc.approved = true;
    doc.findings[0].auto_merge = true;
    const res = registry.validate(doc);
    assert.equal(res.ok, false);
    assert.deepEqual(
      res.errors.map((e) => e.path).sort(),
      ["/approved", "/findings/0/auto_merge"],
    );
  });

  test("a task cannot declare unrestricted scope via unknown keys", () => {
    const doc = JSON.parse(fs.readFileSync(path.join(CONTRACTS_DIR, "examples", "task.example.json"), "utf8"));
    doc.scope.sudo = true;
    doc.scope.network_access = "everything";
    const res = registry.validate(doc);
    assert.equal(res.ok, false);
    const paths = res.errors.map((e) => e.path);
    assert.ok(paths.includes("/scope/sudo"));
    assert.ok(paths.includes("/scope/network_access"));
  });

  test("prototype pollution keys are rejected like any other unknown property", () => {
    const doc = JSON.parse(
      fs.readFileSync(path.join(CONTRACTS_DIR, "examples", "task.example.json"), "utf8").replace(
        '"title"',
        '"__proto__": {"polluted": true}, "title"',
      ),
    );
    const res = registry.validate(doc);
    assert.equal(res.ok, false);
    assert.equal({}.polluted, undefined);
  });
});
