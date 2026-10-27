import { test, describe } from "node:test";
import assert from "node:assert/strict";
import * as labels from "../../src/lib/settings/labels.js";
import { fakeClient } from "../helpers/fake-github.js";

const repo = { owner: "o", name: "r" };

function desired(list, extra = {}) {
  return labels.loadDesired({ version: 1, labels: list, ...extra });
}

function actual(list) {
  return list.map((l) => labels.normalizeLabel(l));
}

describe("labels.loadDesired", () => {
  test("normalises colour case and leading #, defaults description", () => {
    const d = desired([{ name: " x ", color: "#ABCDEF" }]);
    assert.deepEqual(d.labels[0], { name: "x", color: "abcdef", description: "", aliases: [] });
    assert.equal(d.prune, false);
  });
  test("rejects invalid colours", () => {
    assert.throws(() => desired([{ name: "x", color: "red" }]), /color must be 6 hex digits/);
  });
  test("rejects case-insensitive duplicates", () => {
    assert.throws(() => desired([{ name: "Bug" }, { name: "bug" }]), /duplicates labels\[0\]/);
  });
  test("rejects aliases that collide with declared names", () => {
    assert.throws(() => desired([{ name: "a" }, { name: "b", aliases: ["A"] }]), /alias "A" is also a declared label/);
  });
  test("rejects malformed files", () => {
    assert.throws(() => labels.loadDesired({}), /must be an object with a `labels` array/);
    assert.throws(() => desired([{ color: "ffffff" }]), /missing name/);
  });
});

describe("labels.plan", () => {
  test("noop when desired equals actual (colour case-insensitive)", () => {
    const ops = labels.plan(
      desired([{ name: "bug", color: "d73a4a", description: "x" }]),
      actual([{ name: "bug", color: "D73A4A", description: "x" }]),
    );
    assert.deepEqual(
      ops.map((o) => o.type),
      ["noop"],
    );
  });

  test("a case-only name difference matches the existing label and updates its casing", () => {
    const ops = labels.plan(
      desired([{ name: "Bug", color: "d73a4a", description: "x" }]),
      actual([{ name: "bug", color: "d73a4a", description: "x" }]),
    );
    assert.equal(ops.length, 1);
    assert.equal(ops[0].type, "update");
    assert.deepEqual(ops[0].changes, [{ path: "/name", from: "bug", to: "Bug" }]);
  });

  test("creates missing labels", () => {
    const ops = labels.plan(desired([{ name: "new", color: "000000" }]), []);
    assert.equal(ops[0].type, "create");
    assert.deepEqual(ops[0].after, { name: "new", color: "000000", description: "" });
  });

  test("updates colour and description with change records", () => {
    const [op] = labels.plan(
      desired([{ name: "bug", color: "ff0000", description: "new" }]),
      actual([{ name: "bug", color: "00ff00", description: "old" }]),
    );
    assert.equal(op.type, "update");
    assert.deepEqual(op.changes, [
      { path: "/color", from: "00ff00", to: "ff0000" },
      { path: "/description", from: "old", to: "new" },
    ]);
  });

  test("renames via alias instead of create+delete", () => {
    const ops = labels.plan(
      desired([{ name: "kind:bug", color: "d73a4a", description: "Broken", aliases: ["bug"] }], { prune: true }),
      actual([{ name: "bug", color: "d73a4a", description: "Something isn't working" }]),
    );
    assert.equal(ops.length, 1);
    assert.equal(ops[0].type, "rename");
    assert.equal(ops[0].from, "bug");
    assert.equal(ops[0].name, "kind:bug");
    assert.ok(ops[0].changes.some((c) => c.path === "/name" && c.to === "kind:bug"));
    assert.equal(ops[0].changes.filter((c) => c.path === "/name").length, 1);
  });

  test("prefers an exact match over an alias and does not consume the alias twice", () => {
    const ops = labels.plan(
      desired([
        { name: "kind:bug", color: "d73a4a", aliases: ["bug"] },
        { name: "kind:defect", color: "d73a4a", aliases: ["bug"] },
      ]),
      actual([{ name: "bug", color: "d73a4a" }]),
    );
    assert.deepEqual(
      ops.map((o) => [o.type, o.name]),
      [
        ["rename", "kind:bug"],
        ["create", "kind:defect"],
      ],
    );
  });

  test("reports undeclared labels as unmanaged unless prune is set", () => {
    const d = desired([{ name: "keep", color: "000000" }]);
    const a = actual([{ name: "keep", color: "000000" }, { name: "stale", color: "ffffff" }]);
    assert.deepEqual(
      labels.plan(d, a).map((o) => o.type),
      ["noop", "unmanaged"],
    );
    assert.deepEqual(
      labels.plan({ ...d, prune: true }, a).map((o) => o.type),
      ["noop", "delete"],
    );
  });
});

describe("labels.fetchActual / apply", () => {
  test("fetchActual paginates and normalises", async () => {
    const { client, calls } = fakeClient({
      "GET /repos/o/r/labels": [{ name: "A", color: "FFFFFF", description: null }],
    });
    const out = await labels.fetchActual(client, repo);
    assert.deepEqual(out, [{ name: "A", color: "ffffff", description: "", aliases: [] }]);
    assert.equal(calls[0].query.per_page, "100");
  });

  test("apply issues the right HTTP calls and skips noop/unmanaged", async () => {
    const { client, calls } = fakeClient({
      "POST /repos/o/r/labels": { status: 201, body: {} },
      "PATCH /repos/o/r/labels/old": { status: 200, body: {} },
      "PATCH /repos/o/r/labels/upd": { status: 200, body: {} },
      "DELETE /repos/o/r/labels/gone": { status: 204, body: "" },
    });
    const ops = labels.plan(
      desired(
        [
          { name: "new", color: "111111", description: "n" },
          { name: "renamed", color: "222222", aliases: ["old"] },
          { name: "upd", color: "333333", description: "changed" },
          { name: "same", color: "444444" },
        ],
        { prune: true },
      ),
      actual([
        { name: "old", color: "222222" },
        { name: "upd", color: "333333", description: "orig" },
        { name: "same", color: "444444" },
        { name: "gone", color: "555555" },
      ]),
    );
    const results = await labels.apply(client, repo, ops);
    assert.deepEqual(
      calls.map((c) => `${c.method} ${c.path}`),
      [
        "POST /repos/o/r/labels",
        "PATCH /repos/o/r/labels/old",
        "PATCH /repos/o/r/labels/upd",
        "DELETE /repos/o/r/labels/gone",
      ],
    );
    assert.deepEqual(calls[0].body, { name: "new", color: "111111", description: "n" });
    assert.deepEqual(calls[1].body, { new_name: "renamed", color: "222222", description: "" });
    assert.equal(results.filter((r) => r.status === "applied").length, 4);
    assert.equal(results.filter((r) => r.status === "skipped").length, 1);
  });

  test("apply URL-encodes label names", async () => {
    const { client, calls } = fakeClient({
      "DELETE /repos/o/r/labels/good%20first%20issue": { status: 204, body: "" },
    });
    await labels.apply(client, repo, [{ type: "delete", name: "good first issue", changes: [] }]);
    assert.equal(calls[0].path, "/repos/o/r/labels/good%20first%20issue");
  });
});

describe("labels.exportDesired", () => {
  test("produces a sorted desired-state file without aliases", () => {
    const out = labels.exportDesired(actual([{ name: "b", color: "000000" }, { name: "a", color: "ffffff", description: "d" }]));
    assert.deepEqual(out, {
      version: 1,
      prune: false,
      labels: [
        { name: "a", color: "ffffff", description: "d" },
        { name: "b", color: "000000", description: "" },
      ],
    });
    assert.equal(labels.plan(labels.loadDesired(out), actual(out.labels)).every((o) => o.type === "noop"), true);
  });
});
