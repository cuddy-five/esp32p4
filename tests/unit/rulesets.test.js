import { test, describe } from "node:test";
import assert from "node:assert/strict";
import * as rulesets from "../../src/lib/settings/rulesets.js";
import { fakeClient } from "../helpers/fake-github.js";

const repo = { owner: "o", name: "r" };

const DESIRED_PROTECT = {
  name: "protect",
  target: "branch",
  enforcement: "active",
  conditions: { ref_name: { include: ["~DEFAULT_BRANCH"], exclude: [] } },
  rules: [
    { type: "deletion" },
    { type: "pull_request", parameters: { required_approving_review_count: 1 } },
  ],
};

/** A realistic GET /rulesets/{id} payload with server-populated defaults. */
const LIVE_PROTECT = {
  id: 77,
  name: "protect",
  target: "branch",
  source_type: "Repository",
  source: "o/r",
  enforcement: "active",
  conditions: { ref_name: { exclude: [], include: ["~DEFAULT_BRANCH"] } },
  rules: [
    {
      type: "pull_request",
      parameters: {
        required_approving_review_count: 1,
        dismiss_stale_reviews_on_push: false,
        required_reviewers: [],
        allowed_merge_methods: ["merge", "squash", "rebase"],
      },
    },
    { type: "deletion" },
  ],
  bypass_actors: [],
  node_id: "RRS_x",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  current_user_can_bypass: "never",
  _links: { self: { href: "https://api.example.test/repos/o/r/rulesets/77" } },
};

function desired(list, extra = {}) {
  return rulesets.loadDesired({ version: 1, rulesets: list, ...extra });
}

describe("rulesets.loadDesired", () => {
  test("defaults to declared comparison and no prune", () => {
    const d = desired([DESIRED_PROTECT]);
    assert.equal(d.mode, "declared");
    assert.equal(d.prune, false);
    assert.deepEqual(d.rulesets[0].bypass_actors, []);
  });
  test("validates target, enforcement, rules, and uniqueness", () => {
    assert.throws(() => desired([{ ...DESIRED_PROTECT, target: "repo" }]), /target must be one of/);
    assert.throws(() => desired([{ ...DESIRED_PROTECT, enforcement: "on" }]), /enforcement must be one of/);
    assert.throws(() => desired([{ ...DESIRED_PROTECT, rules: undefined }]), /rules must be an array/);
    assert.throws(() => desired([DESIRED_PROTECT, DESIRED_PROTECT]), /duplicate ruleset name/);
    assert.throws(() => desired([DESIRED_PROTECT], { comparison: "fuzzy" }), /comparison must be/);
  });
});

describe("rulesets.normalizeRuleset", () => {
  test("drops server fields and nulls, keeps declared body", () => {
    const n = rulesets.normalizeRuleset({ ...LIVE_PROTECT, conditions: { ...LIVE_PROTECT.conditions, repository_name: null } });
    assert.deepEqual(Object.keys(n).sort(), ["bypass_actors", "conditions", "enforcement", "name", "rules", "target"]);
    assert.equal("repository_name" in n.conditions, false);
  });
});

describe("rulesets.plan", () => {
  test("declared mode tolerates server defaults and rule order", () => {
    const ops = rulesets.plan(desired([DESIRED_PROTECT]), [{ ...rulesets.normalizeRuleset(LIVE_PROTECT), id: 77 }]);
    assert.deepEqual(
      ops.map((o) => o.type),
      ["noop"],
    );
    assert.equal(ops[0].id, 77);
  });

  test("strict mode reports server defaults as drift", () => {
    const ops = rulesets.plan(
      desired([DESIRED_PROTECT], { comparison: "strict" }),
      [{ ...rulesets.normalizeRuleset(LIVE_PROTECT), id: 77 }],
    );
    assert.equal(ops[0].type, "update");
    assert.ok(ops[0].changes.length > 0);
  });

  test("detects a changed declared parameter", () => {
    const changed = structuredClone(DESIRED_PROTECT);
    changed.rules[1].parameters.required_approving_review_count = 2;
    const ops = rulesets.plan(desired([changed]), [{ ...rulesets.normalizeRuleset(LIVE_PROTECT), id: 77 }]);
    assert.equal(ops[0].type, "update");
    assert.equal(ops[0].changes[0].path, "/rules");
  });

  test("detects enforcement change", () => {
    const ops = rulesets.plan(
      desired([{ ...DESIRED_PROTECT, enforcement: "disabled" }]),
      [{ ...rulesets.normalizeRuleset(LIVE_PROTECT), id: 77 }],
    );
    assert.deepEqual(ops[0].changes, [{ path: "/enforcement", from: "active", to: "disabled" }]);
  });

  test("creates missing and reports undeclared as unmanaged or delete", () => {
    const live = [{ ...rulesets.normalizeRuleset({ ...LIVE_PROTECT, name: "legacy" }), id: 5 }];
    assert.deepEqual(
      rulesets.plan(desired([DESIRED_PROTECT]), live).map((o) => [o.type, o.name]),
      [
        ["create", "protect"],
        ["unmanaged", "legacy"],
      ],
    );
    assert.deepEqual(
      rulesets.plan(desired([DESIRED_PROTECT], { prune: true }), live).map((o) => [o.type, o.name, o.id]),
      [
        ["create", "protect", undefined],
        ["delete", "legacy", 5],
      ],
    );
  });
});

describe("rulesets.fetchActual / apply", () => {
  test("fetchActual lists then fetches each ruleset by id", async () => {
    const { client, calls } = fakeClient({
      "GET /repos/o/r/rulesets": [{ id: 77, name: "protect" }],
      "GET /repos/o/r/rulesets/77": LIVE_PROTECT,
    });
    const out = await rulesets.fetchActual(client, repo);
    assert.equal(out.length, 1);
    assert.equal(out[0].id, 77);
    assert.equal("_links" in out[0], false);
    assert.equal(calls[0].query.includes_parents, "false");
  });

  test("apply posts creates, puts updates by id, deletes by id", async () => {
    const { client, calls } = fakeClient({
      "POST /repos/o/r/rulesets": { status: 201, body: { id: 1 } },
      "PUT /repos/o/r/rulesets/77": { status: 200, body: {} },
      "DELETE /repos/o/r/rulesets/5": { status: 204, body: "" },
    });
    const live = [
      { ...rulesets.normalizeRuleset({ ...LIVE_PROTECT, enforcement: "disabled" }), id: 77 },
      { ...rulesets.normalizeRuleset({ ...LIVE_PROTECT, name: "legacy" }), id: 5 },
    ];
    const ops = rulesets.plan(desired([DESIRED_PROTECT, { ...DESIRED_PROTECT, name: "tags", target: "tag" }], { prune: true }), live);
    const results = await rulesets.apply(client, repo, ops);
    assert.deepEqual(
      calls.map((c) => `${c.method} ${c.path}`),
      ["PUT /repos/o/r/rulesets/77", "POST /repos/o/r/rulesets", "DELETE /repos/o/r/rulesets/5"],
    );
    assert.equal(calls[0].body.enforcement, "active");
    assert.equal(calls[1].body.name, "tags");
    assert.equal(results.filter((r) => r.status === "applied").length, 3);
  });
});

describe("rulesets.exportDesired", () => {
  test("round-trips to a noop plan", () => {
    const live = [{ ...rulesets.normalizeRuleset(LIVE_PROTECT), id: 77 }];
    const exported = rulesets.exportDesired(live);
    assert.equal(exported.comparison, "declared");
    assert.equal("id" in exported.rulesets[0], false);
    const ops = rulesets.plan(rulesets.loadDesired(exported), live);
    assert.deepEqual(
      ops.map((o) => o.type),
      ["noop"],
    );
  });
});
