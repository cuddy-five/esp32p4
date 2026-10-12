import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { canonicalize, diff, sortCollection, stripNullish } from "../../src/lib/diff.js";

describe("canonicalize", () => {
  test("is independent of key order", () => {
    assert.equal(canonicalize({ b: 1, a: { d: 2, c: 3 } }), canonicalize({ a: { c: 3, d: 2 }, b: 1 }));
  });
  test("drops undefined values", () => {
    assert.equal(canonicalize({ a: undefined, b: 1 }), '{"b":1}');
  });
});

describe("stripNullish", () => {
  test("removes null and undefined recursively", () => {
    assert.deepEqual(stripNullish({ a: null, b: { c: undefined, d: 0 }, e: [null, 1] }), {
      b: { d: 0 },
      e: [null, 1],
    });
  });
});

describe("sortCollection", () => {
  test("does not mutate and sorts by canonical form", () => {
    const input = [{ type: "b" }, { type: "a" }];
    const out = sortCollection(input);
    assert.deepEqual(out, [{ type: "a" }, { type: "b" }]);
    assert.deepEqual(input, [{ type: "b" }, { type: "a" }]);
  });
});

describe("diff (strict)", () => {
  test("empty for identical structures regardless of key order", () => {
    assert.deepEqual(diff({ a: 1, b: [1, 2] }, { b: [1, 2], a: 1 }), []);
  });
  test("reports scalar changes with pointer paths", () => {
    assert.deepEqual(diff({ a: { b: 2 } }, { a: { b: 1 } }), [{ path: "/a/b", from: 1, to: 2 }]);
  });
  test("reports extra actual keys as removals", () => {
    assert.deepEqual(diff({ a: 1 }, { a: 1, extra: true }), [{ path: "/extra", from: true, to: undefined }]);
  });
  test("reports missing actual keys as additions", () => {
    assert.deepEqual(diff({ a: 1, n: 2 }, { a: 1 }), [{ path: "/n", from: undefined, to: 2 }]);
  });
  test("array order is not significant", () => {
    assert.deepEqual(diff({ r: [{ type: "x" }, { type: "y" }] }, { r: [{ type: "y" }, { type: "x" }] }), []);
  });
  test("array length mismatch is reported at the array path", () => {
    const out = diff({ r: [1, 2] }, { r: [1] });
    assert.equal(out.length, 1);
    assert.equal(out[0].path, "/r");
  });
  test("root scalar difference uses / path", () => {
    assert.deepEqual(diff("a", "b"), [{ path: "/", from: "b", to: "a" }]);
  });
});

describe("diff (declared)", () => {
  test("tolerates extra keys on actual", () => {
    assert.deepEqual(diff({ a: 1 }, { a: 1, server_default: true }, { mode: "declared" }), []);
  });
  test("still reports declared keys that differ", () => {
    assert.deepEqual(diff({ a: 1 }, { a: 2, server_default: true }, { mode: "declared" }), [
      { path: "/a", from: 2, to: 1 },
    ]);
  });
  test("matches array elements as subsets, order-insensitive", () => {
    const desired = { rules: [{ type: "deletion" }, { type: "pull_request", parameters: { count: 1 } }] };
    const actual = {
      rules: [
        { type: "pull_request", parameters: { count: 1, allowed_merge_methods: ["squash"] } },
        { type: "deletion" },
      ],
    };
    assert.deepEqual(diff(desired, actual, { mode: "declared" }), []);
  });
  test("reports when no actual element satisfies a declared element", () => {
    const desired = { rules: [{ type: "pull_request", parameters: { count: 2 } }] };
    const actual = { rules: [{ type: "pull_request", parameters: { count: 1, extra: 1 } }] };
    const out = diff(desired, actual, { mode: "declared" });
    assert.equal(out.length, 1);
    assert.equal(out[0].path, "/rules");
  });
  test("does not double-match the same actual element", () => {
    const desired = { rules: [{ type: "a" }, { type: "a" }] };
    const actual = { rules: [{ type: "a" }, { type: "b" }] };
    assert.equal(diff(desired, actual, { mode: "declared" }).length, 1);
  });
});
