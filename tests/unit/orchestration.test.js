import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import YAML from "yaml";
import {
  APPROVALS_FILE,
  STATE_MACHINE_FILE,
  checkPolicies,
  contractEnums,
  globMatch,
  loadApprovals,
  loadStateMachine,
  requiredHumanStages,
} from "../../src/lib/orchestration.js";
import { EXIT, main } from "../../src/cli.js";

const enums = contractEnums();

function withMutated(file, mutate) {
  const doc = YAML.parse(fs.readFileSync(file, "utf8"));
  mutate(doc);
  const tmp = path.join(os.tmpdir(), `cp-${path.basename(file)}-${process.pid}-${Math.random().toString(36).slice(2)}`);
  fs.writeFileSync(tmp, YAML.stringify(doc));
  return tmp;
}

describe("state-machine.yaml", () => {
  const { doc, problems, edges } = loadStateMachine();

  test("has no problems against the current contracts", () => {
    assert.deepEqual(problems, []);
  });

  test("states equal the task.status enum exactly", () => {
    assert.deepEqual(Object.keys(doc.states).sort(), [...enums.states].sort());
  });

  test("every state owner and transition actor is a contract role", () => {
    for (const s of Object.values(doc.states)) assert.ok(enums.roles.includes(s.owner));
    for (const e of edges) for (const a of e.actors) assert.ok(enums.roles.includes(a));
  });

  test("terminal states have no outgoing transitions", () => {
    for (const e of edges) assert.ok(!doc.terminal.includes(e.from), `${e.from} -> ${e.to}`);
  });

  test("only humans leave awaiting_approval, except into blocked", () => {
    for (const e of edges.filter((e) => e.from === "awaiting_approval" && e.to !== "blocked")) {
      assert.deepEqual(e.actors, ["human"], `${e.from} -> ${e.to}`);
    }
  });

  test("the implementer can never move a task to done or verifying", () => {
    for (const e of edges.filter((e) => e.actors.includes("implementer"))) {
      assert.ok(!["done", "verifying"].includes(e.to), `implementer may not ${e.from} -> ${e.to}`);
    }
  });

  test("reaching done always passes through verification", () => {
    const intoDone = edges.filter((e) => e.to === "done");
    assert.ok(intoDone.length > 0);
    for (const e of intoDone) {
      assert.ok(e.gates.includes("verification_passed"), `${e.from} -> done lacks verification_passed`);
      assert.ok(e.gates.includes("approval_granted"), `${e.from} -> done lacks human approval`);
      assert.deepEqual(e.actors, ["human"]);
    }
  });

  test("every gate referenced is defined and every defined gate is referenced", () => {
    const used = new Set(edges.flatMap((e) => e.gates));
    for (const g of used) assert.ok(doc.gates[g], g);
    for (const g of Object.keys(doc.gates)) assert.ok(used.has(g), `gate ${g} is defined but unused`);
  });

  test("planning branches select complementary approval requirements", () => {
    assert.equal(doc.gates.approval_required?.status, "planned");
    for (const [to, required, excluded] of [
      ["awaiting_approval", "approval_required", "approval_not_required"],
      ["in_progress", "approval_not_required", "approval_required"],
    ]) {
      const branches = edges.filter((e) => e.from === "planning" && e.to === to);
      assert.equal(branches.length, 1);
      for (const gate of ["plan_valid", "plan_reviewed", "no_open_escalation", required]) {
        assert.ok(branches[0].gates.includes(gate), `${to} lacks ${gate}`);
      }
      assert.ok(!branches[0].gates.includes(excluded), `${to} includes ${excluded}`);
    }
  });

  test("invariants cover separation of duties and human-only approvals", () => {
    const ids = doc.invariants.map((i) => i.id);
    assert.ok(ids.includes("separation_of_duties"));
    assert.ok(ids.includes("human_only_approvals"));
    assert.ok(ids.includes("halt_is_total"));
  });

  test("detects an unknown state", () => {
    const f = withMutated(STATE_MACHINE_FILE, (d) => {
      d.states.limbo = { description: "x", owner: "coordinator" };
    });
    const { problems } = loadStateMachine({ file: f, enums });
    assert.ok(problems.some((p) => p.path === "/states/limbo" && /not a task.status/.test(p.message)));
    assert.ok(problems.some((p) => p.path === "/states/limbo" && /unreachable/.test(p.message)));
  });

  test("detects a missing state definition", () => {
    const f = withMutated(STATE_MACHINE_FILE, (d) => {
      delete d.states.blocked;
    });
    const { problems } = loadStateMachine({ file: f, enums });
    assert.ok(problems.some((p) => /"blocked" has no state definition/.test(p.message)));
  });

  test("detects an agent completing a task from awaiting_approval", () => {
    const f = withMutated(STATE_MACHINE_FILE, (d) => {
      d.transitions.push({ from: "awaiting_approval", to: "done", actor: "coordinator" });
    });
    const { problems } = loadStateMachine({ file: f, enums });
    assert.ok(problems.some((p) => /with a non-human actor/.test(p.message)));
    assert.ok(problems.some((p) => /must gate on approval_granted/.test(p.message)));
  });

  test("rejects mixed human and agent actors leaving human-owned states", () => {
    for (const from of ["awaiting_approval", "blocked"]) {
      const f = withMutated(STATE_MACHINE_FILE, (d) => {
        d.transitions.push({ from, to: "in_progress", actor: ["human", "implementer"] });
      });
      const { problems } = loadStateMachine({ file: f, enums });
      assert.ok(problems.some((p) => p.message === `leaves human-owned state "${from}" with a non-human actor`));
    }
  });

  test("allows an agent to halt a human-owned state into blocked", () => {
    const f = withMutated(STATE_MACHINE_FILE, (d) => {
      d.transitions.push({ from: "awaiting_approval", to: "blocked", actor: ["human", "coordinator"] });
    });
    assert.deepEqual(loadStateMachine({ file: f, enums }).problems, []);
  });

  test("detects transitions out of terminal states and undefined gates", () => {
    const f = withMutated(STATE_MACHINE_FILE, (d) => {
      d.transitions.push({ from: "done", to: "in_progress", actor: "human", gates: ["vibes"] });
    });
    const { problems } = loadStateMachine({ file: f, enums });
    assert.ok(problems.some((p) => /terminal and cannot have outgoing/.test(p.message)));
    assert.ok(problems.some((p) => /gate "vibes" is not defined/.test(p.message)));
  });

  test("detects a state that cannot reach a terminal state", () => {
    const f = withMutated(STATE_MACHINE_FILE, (d) => {
      d.transitions = d.transitions.filter((t) => !(Array.isArray(t.from) && t.from.includes("blocked")) && t.from !== "blocked");
    });
    const { problems } = loadStateMachine({ file: f, enums });
    assert.ok(problems.some((p) => p.path === "/states/blocked" && /cannot reach a terminal/.test(p.message)));
  });
});

describe("approvals.yaml", () => {
  const { doc, problems } = loadApprovals();

  test("has no problems against the current contracts", () => {
    assert.deepEqual(problems, []);
  });

  test("covers every risk level and only risk levels", () => {
    assert.deepEqual(Object.keys(doc.by_risk).sort(), [...enums.riskLevels].sort());
  });

  test("every risk requires human merge; critical requires every stage", () => {
    for (const risk of enums.riskLevels) assert.ok(doc.by_risk[risk].human_stages.includes("merge"));
    assert.deepEqual(doc.by_risk.low.human_stages, ["merge"]);
    assert.deepEqual([...doc.by_risk.critical.human_stages].sort(), Object.keys(doc.stages).sort());
  });

  test("security review is required from medium upwards", () => {
    for (const level of ["medium", "high", "critical"]) assert.equal(doc.by_risk[level].security_review, "required");
  });

  test("changes to the control plane itself always need a human", () => {
    const rule = doc.always_human.find((r) => r.id === "control_plane_self");
    assert.ok(rule);
    assert.ok(rule.paths.includes(".github/control-plane/**"));
    assert.ok(rule.stages.includes("plan") && rule.stages.includes("merge"));
  });

  test("approvals must come from humans and expire", () => {
    assert.equal(doc.approval.must_be_from, "human");
    assert.ok(doc.approval.expires_after_hours > 0);
  });

  test("detects non-monotonic human stages", () => {
    const f = withMutated(APPROVALS_FILE, (d) => {
      d.by_risk.high.human_stages = [];
    });
    const { problems } = loadApprovals({ file: f, enums });
    assert.ok(problems.some((p) => p.path === "/by_risk/high/human_stages" && /drops stage "merge"/.test(p.message)));
  });

  test("detects unknown stages, tags, review kinds, and non-human approvers", () => {
    const f = withMutated(APPROVALS_FILE, (d) => {
      d.by_risk.low.human_stages = ["deploy"];
      d.by_risk.low.required_reviews = ["vibes"];
      d.always_human[0].tags = ["cosmic"];
      d.approval.must_be_from = "coordinator";
    });
    const { problems } = loadApprovals({ file: f, enums });
    const msgs = problems.map((p) => p.message).join("\n");
    assert.match(msgs, /"deploy" is not a defined stage/);
    assert.match(msgs, /"vibes" is not a review_kind/);
    assert.match(msgs, /"cosmic" is not a task risk tag/);
    assert.match(msgs, /must be "human"/);
  });

  test("detects a missing risk level", () => {
    const f = withMutated(APPROVALS_FILE, (d) => {
      delete d.by_risk.medium;
    });
    const { problems } = loadApprovals({ file: f, enums });
    assert.ok(problems.some((p) => p.path === "/by_risk/medium"));
  });
});

describe("requiredHumanStages", () => {
  const { approvals } = checkPolicies();

  test("low risk in ordinary paths still needs the owner's merge decision", () => {
    assert.deepEqual(requiredHumanStages(approvals, { risk: { level: "low" }, paths: ["src/a.js"] }), {
      stages: ["merge"], reasons: ["risk level low"],
    });
  });

  test("risk level drives stages", () => {
    assert.deepEqual(requiredHumanStages(approvals, { risk: { level: "medium" } }).stages, ["merge"]);
    assert.deepEqual(requiredHumanStages(approvals, { risk: { level: "high" } }).stages, ["plan", "merge"]);
  });

  test("always-human path rules escalate low-risk tasks", () => {
    const out = requiredHumanStages(approvals, { risk: { level: "low" }, paths: [".github/workflows/ci.yml"] });
    assert.deepEqual(out.stages, ["plan", "merge"]);
    assert.deepEqual(out.reasons, ["risk level low", "control_plane_self"]);
  });

  test("always-human path rules normalize leading ./ paths", () => {
    const out = requiredHumanStages(approvals, { risk: { level: "low" }, paths: ["./.github/workflows/ci.yml"] });
    assert.deepEqual(out.stages, ["plan", "merge"]);
    assert.deepEqual(out.reasons, ["risk level low", "control_plane_self"]);
  });

  test("instruction and ownership changes need a human at plan and merge", () => {
    for (const file of ["AGENTS.md", "src/AGENTS.md", "src/lib/AGENTS.md", "CLAUDE.md", "app/CLAUDE.md", "app/lib/CLAUDE.md", "PROJECT.md",
      ".github/CODEOWNERS", ".github/copilot-instructions.md", ".github/instructions/build.instructions.md",
      ".github/agents/reviewer.agent.md", ".github/skills/compile/SKILL.md", "docs/runbooks/agent-team.md",
      "docs/runbooks/overseer.md", "docs/templates/project-brief.md"]) {
      const out = requiredHumanStages(approvals, { risk: { level: "low" }, paths: [file] });
      assert.deepEqual(out.stages, ["plan", "merge"], file);
      assert.ok(out.reasons.includes("instructions_and_ownership"), file);
    }
  });

  test("always-human tag rules escalate low-risk tasks", () => {
    const out = requiredHumanStages(approvals, { risk: { level: "low", tags: ["dependencies"] } });
    assert.deepEqual(out.stages, ["merge"]);
    assert.deepEqual(out.reasons, ["risk level low", "supply_chain"]);
  });

  test("dependency files retain supply-chain reasons at every directory depth", () => {
    const filenames = ["package.json", "package-lock.json", "pnpm-lock.yaml", "yarn.lock",
      "requirements.txt", "requirements-dev.txt", "poetry.lock", "go.sum", "Cargo.lock", "Gemfile.lock"];
    for (const prefix of ["", "app/", "packages/web/"]) {
      for (const filename of filenames) {
        const file = `${prefix}${filename}`;
        const out = requiredHumanStages(approvals, { risk: { level: "low" }, paths: [file] });
        assert.ok(out.reasons.includes("supply_chain"), file);
        assert.deepEqual(out.stages, ["merge"], file);
        const lookalike = requiredHumanStages(approvals, { risk: { level: "low" }, paths: [`${file}.bak`] });
        assert.ok(!lookalike.reasons.includes("supply_chain"), `${file}.bak`);
      }
    }
  });

  test("wildcard allowed paths match specific always-human policy rules bidirectionally", () => {
    const out = requiredHumanStages(approvals, { risk: { level: "low" }, paths: ["**"] });
    assert.deepEqual(out.stages, ["plan", "merge"]);
    assert.ok(out.reasons.includes("control_plane_self"));
    assert.ok(out.reasons.includes("instructions_and_ownership"));

    const mdScope = requiredHumanStages(approvals, { risk: { level: "low" }, paths: ["*.md"] });
    assert.ok(mdScope.reasons.includes("instructions_and_ownership"));
  });

  for (const [pattern, files] of [
    ["**/AGENTS.md", ["AGENTS.md", "src/AGENTS.md", "src/lib/AGENTS.md"]],
    ["src/**/*.js", ["src/cli.js", "src/lib/a.js", "src/lib/settings/a.js"]],
  ]) {
    test(`wildcard-only policy ${pattern} classifies zero and nested directories`, () => {
      const policy = {
        stages: { plan: {}, merge: {} },
        by_risk: { low: { human_stages: ["merge"] } },
        always_human: [{ id: "wildcard_rule", paths: [pattern], stages: ["plan", "merge"] }],
      };
      for (const file of files) {
        assert.deepEqual(requiredHumanStages(policy, { risk: { level: "low" }, paths: [file] }), {
          stages: ["plan", "merge"], reasons: ["risk level low", "wildcard_rule"],
        }, file);
        assert.deepEqual(requiredHumanStages(policy, { risk: { level: "low" }, paths: [`${file}.bak`] }), {
          stages: ["merge"], reasons: ["risk level low"],
        }, `${file}.bak`);
      }
    });
  }

  test("stages are returned in policy order without duplicates", () => {
    const out = requiredHumanStages(approvals, {
      risk: { level: "critical", tags: ["secrets"] },
      paths: ["package.json", ".github/control-plane/x"],
    });
    assert.deepEqual(out.stages, ["plan", "merge", "step"]);
  });
});

describe("globMatch", () => {
  test("** spans directories, * stays within a segment", () => {
    assert.ok(globMatch(".github/control-plane/**", ".github/control-plane/a/b/c.json"));
    assert.ok(globMatch("requirements*.txt", "requirements-dev.txt"));
    assert.ok(!globMatch("src/*.js", "src/lib/a.js"));
    assert.ok(globMatch("src/**/*.js", "src/lib/a.js"));
    assert.ok(!globMatch("package.json", "package.json.bak"));
  });

  test("nested patterns and multi-directory wildcards match expected files", () => {
    for (const [pattern, files] of [
      ["**/AGENTS.md", ["AGENTS.md", "src/AGENTS.md", "src/lib/AGENTS.md"]],
      ["src/**/*.js", ["src/cli.js", "src/lib/a.js", "src/lib/settings/a.js"]],
      ["**/**/a.js", ["a.js", "lib/a.js", "src/lib/a.js"]],
      ["src/**/**/a.js", ["src/a.js", "src/lib/a.js", "src/lib/settings/a.js"]],
    ]) {
      for (const file of files) {
        assert.ok(globMatch(pattern, file), `${pattern} should match ${file}`);
      }
    }
  });

  test("single stars match zero or more characters without crossing slash", () => {
    assert.ok(globMatch("src/a*.js", "src/a.js"));
    assert.ok(globMatch("src/a*.js", "src/abc.js"));
    assert.ok(!globMatch("src/a*.js", "src/a/b.js"));
  });

  test("trailing and embedded double stars retain path-spanning behavior", () => {
    for (const file of ["src/", "src/a.js", "src/lib/a.js"]) assert.ok(globMatch("src/**", file), file);
    for (const file of ["prepost", "pre-mid-post", "pre/a/post"]) assert.ok(globMatch("pre**post", file), file);
    assert.ok(globMatch("prefix**/a.js", "prefix/x/a.js"));
    assert.ok(!globMatch("prefix**/a.js", "prefixa.js"));
  });

  test("regex metacharacters remain literal, including a dot before a star", () => {
    const literal = "src/a.+?^${}()|[]\\.js";
    assert.ok(globMatch(literal, literal));
    assert.ok(!globMatch(literal, "src/ab.js"));
    assert.ok(globMatch("src/.*", "src/."));
    assert.ok(globMatch("src/.*", "src/.config"));
    assert.ok(!globMatch("src/.*", "src/config"));
    assert.ok(!globMatch("src/.*", "src/.config/file"));
  });

  test("matching remains anchored at both ends", () => {
    assert.ok(!globMatch("src/**/*.js", "prefix/src/a.js"));
    assert.ok(!globMatch("src/**/*.js", "src/a.js.bak"));
    assert.ok(!globMatch("**/AGENTS.md", "src/AGENTS.md.bak"));
    assert.ok(!globMatch("AGENTS.md", "src/AGENTS.md"));
  });
});

describe("cli policy", () => {
  function capture() {
    const out = [];
    const err = [];
    return { out, err, io: { stdout: (s) => out.push(s), stderr: (s) => err.push(s), env: {} } };
  }

  test("check reports ok with counts", async () => {
    const { out, io } = capture();
    assert.equal(await main(["policy", "check"], io), EXIT.OK);
    assert.match(out.join("\n"), /state machine: 10 states/);
    assert.match(out.at(-1), /policy: ok/);
  });

  test("check --format json", async () => {
    const { out, io } = capture();
    assert.equal(await main(["policy", "check", "--format", "json"], io), EXIT.OK);
    assert.equal(JSON.parse(out.join("\n")).ok, true);
  });

  test("stages explains the decision", async () => {
    const a = capture();
    assert.equal(await main(["policy", "stages", "--risk", "low"], a.io), EXIT.OK);
    assert.match(a.out[0], /human approval required at: merge/);
    const b = capture();
    assert.equal(await main(["policy", "stages", "--risk", "high", "--path", "package.json"], b.io), EXIT.OK);
    assert.match(b.out[0], /plan, merge/);
    assert.match(b.out[1], /risk level high, supply_chain/);
  });

  test("stages rejects missing or unknown risk", async () => {
    assert.equal(await main(["policy", "stages"], capture().io), EXIT.ERROR);
    assert.equal(await main(["policy", "stages", "--risk", "yolo"], capture().io), EXIT.ERROR);
    assert.equal(await main(["policy", "nope"], capture().io), EXIT.ERROR);
  });
});
