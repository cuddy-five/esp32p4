import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { ContractRegistry, normalizeErrors, validateFile } from "../../src/lib/contracts.js";
import { CONTRACTS_DIR } from "../../src/lib/paths.js";

const EXAMPLES_DIR = path.join(CONTRACTS_DIR, "examples");
const registry = new ContractRegistry();

function loadExample(kind) {
  return JSON.parse(fs.readFileSync(path.join(EXAMPLES_DIR, `${kind}.example.json`), "utf8"));
}

describe("ContractRegistry", () => {
  test("registers exactly the seven contract kinds", () => {
    assert.deepEqual(registry.list(), [
      "escalation",
      "evidence",
      "handoff",
      "plan",
      "result",
      "review",
      "task",
    ]);
    assert.equal(registry.has("common"), false);
  });

  test("every example document validates against its own schema", () => {
    for (const kind of registry.list()) {
      const res = validateFile(registry, path.join(EXAMPLES_DIR, `${kind}.example.json`));
      assert.equal(res.ok, true, `${kind}: ${JSON.stringify(res.errors, null, 2)}`);
      assert.equal(res.kind, kind);
    }
  });

  test("every example shares a single trace correlation id", () => {
    const ids = new Set(registry.list().map((k) => loadExample(k).trace.correlation_id));
    assert.equal(ids.size, 1);
  });

  test("a document validated against the wrong kind fails on the contract const", () => {
    const res = registry.validate(loadExample("task"), { kind: "plan" });
    assert.equal(res.ok, false);
    assert.ok(res.errors.some((e) => e.path === "/contract" && e.keyword === "const"));
  });

  test("unknown properties are rejected at the top level", () => {
    const doc = { ...loadExample("task"), surprise: true };
    const res = registry.validate(doc);
    assert.equal(res.ok, false);
    assert.deepEqual(
      res.errors.map((e) => [e.path, e.keyword]),
      [["/surprise", "unevaluatedProperties"]],
    );
  });

  test("unknown properties are rejected inside nested objects", () => {
    const doc = structuredClone(loadExample("review"));
    doc.findings[0].extra = "nope";
    const res = registry.validate(doc);
    assert.equal(res.ok, false);
    assert.ok(res.errors.some((e) => e.path === "/findings/0/extra"));
  });

  test("missing envelope fields are reported with JSON pointer paths", () => {
    const doc = structuredClone(loadExample("result"));
    delete doc.producer;
    delete doc.created_at;
    const res = registry.validate(doc);
    assert.equal(res.ok, false);
    const paths = res.errors.map((e) => e.path);
    assert.ok(paths.includes("/producer"));
    assert.ok(paths.includes("/created_at"));
  });

  test("infers kind from the contract field and errors clearly when absent", () => {
    const res = registry.validate({ id: "abcd" });
    assert.equal(res.ok, false);
    assert.equal(res.kind, undefined);
    assert.match(res.errors[0].message, /no `contract` field/);
  });

  test("unknown contract kinds are rejected with the list of known kinds", () => {
    const res = registry.validate({ contract: "invoice" });
    assert.equal(res.ok, false);
    assert.equal(res.kind, "invoice");
    assert.match(res.errors[0].message, /known: escalation, evidence/);
  });

  test("enum violations list allowed values", () => {
    const doc = structuredClone(loadExample("escalation"));
    doc.reason = "because";
    const res = registry.validate(doc);
    assert.equal(res.ok, false);
    const err = res.errors.find((e) => e.path === "/reason");
    assert.match(err.message, /must be one of: budget_exceeded/);
  });

  test("format assertions are enforced (date-time, uri, sha)", () => {
    const doc = structuredClone(loadExample("evidence"));
    doc.created_at = "yesterday";
    doc.subject.sha = "not-a-sha";
    doc.artifacts = [{ name: "x", kind: "log", uri: "no scheme" }];
    const res = registry.validate(doc);
    assert.equal(res.ok, false);
    const paths = res.errors.map((e) => e.path);
    assert.ok(paths.includes("/created_at"));
    assert.ok(paths.includes("/subject/sha"));
    assert.ok(paths.includes("/artifacts/0/uri"));
  });

  test("schema_version must be semver", () => {
    const doc = { ...loadExample("task"), schema_version: "v1" };
    const res = registry.validate(doc);
    assert.equal(res.ok, false);
    assert.ok(res.errors.some((e) => e.path === "/schema_version"));
  });

  test("local ids accept short slugs while document ids require length", () => {
    const plan = structuredClone(loadExample("plan"));
    plan.steps[0].id = "a";
    assert.equal(registry.validate(plan).ok, true);
    plan.id = "ab";
    assert.equal(registry.validate(plan).ok, false);
  });

  test("validateFile reports JSON parse failures without throwing", () => {
    const file = path.join(process.env.TMPDIR ?? "/tmp", `cp-bad-${process.pid}.json`);
    fs.writeFileSync(file, "{ not json");
    try {
      const res = validateFile(registry, file);
      assert.equal(res.ok, false);
      assert.equal(res.errors[0].keyword, "parse");
    } finally {
      fs.unlinkSync(file);
    }
  });

  test("schemaFor throws for unknown kinds", () => {
    assert.throws(() => registry.schemaFor("nope"), /unknown contract kind "nope"/);
  });
});

describe("normalizeErrors", () => {
  test("deduplicates identical errors and sorts by path", () => {
    const out = normalizeErrors([
      { instancePath: "/b", keyword: "type", message: "must be string", params: {} },
      { instancePath: "/a", keyword: "required", message: "x", params: { missingProperty: "z" } },
      { instancePath: "/b", keyword: "type", message: "must be string", params: {} },
    ]);
    assert.deepEqual(
      out.map((e) => [e.path, e.keyword]),
      [
        ["/a/z", "required"],
        ["/b", "type"],
      ],
    );
  });

  test("returns an empty array for null input", () => {
    assert.deepEqual(normalizeErrors(null), []);
  });
});
