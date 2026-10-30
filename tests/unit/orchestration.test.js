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

describe("loader-enforced invariants", () => {
  function capture() {
    const out = [];
    const err = [];
    return { out, err, io: { stdout: (s) => out.push(s), stderr: (s) => err.push(s), env: {} } };
  }
  const withText = (text) => {
    const tmp = path.join(os.tmpdir(), `cp-raw-${process.pid}-${Math.random().toString(36).slice(2)}.yaml`);
    fs.writeFileSync(tmp, text);
    return tmp;
  };

  test("every mandatory gate holds on every route into done", () => {
    const { doc, problems } = loadStateMachine();
    assert.deepEqual(problems, []);
    assert.deepEqual([...doc.mandatory_gates.done].sort(), [
      "approval_granted", "evidence_collected", "plan_reviewed", "plan_valid",
      "reviews_approve", "verification_passed", "within_scope",
    ]);
  });

  test("a route into done that skips a mandatory gate is reported", () => {
    const f = withMutated(STATE_MACHINE_FILE, (d) => {
      const intoDone = d.transitions.find((t) => t.from === "awaiting_approval" && t.to === "done");
      intoDone.gates = intoDone.gates.filter((g) => g !== "reviews_approve");
    });
    const { problems } = loadStateMachine({ file: f, enums });
    assert.ok(problems.some((p) => p.message === '"done" is reachable without gate "reviews_approve"'));
  });

  test("an undefined mandatory gate is reported", () => {
    const f = withMutated(STATE_MACHINE_FILE, (d) => {
      d.mandatory_gates.done.push("vibes");
    });
    const { problems } = loadStateMachine({ file: f, enums });
    assert.ok(problems.some((p) => p.path === "/mandatory_gates/done" && /gate "vibes" is not defined/.test(p.message)));
  });

  test("a human can halt every active state, and blocked returns to each of them", () => {
    const { edges } = loadStateMachine();
    const into = edges.filter((e) => e.to === "blocked");
    assert.ok(into.every((e) => e.actors.includes("human")));
    const sources = new Set(into.map((e) => e.from));
    const targets = new Set(edges.filter((e) => e.from === "blocked" && e.to !== "cancelled").map((e) => e.to));
    for (const s of sources) assert.ok(targets.has(s), `blocked cannot return to ${s}`);
  });

  test("the security auditor can send work back from review", () => {
    const { edges } = loadStateMachine();
    const back = edges.find((e) => e.from === "in_review" && e.to === "in_progress");
    assert.ok(back.actors.includes("security_auditor"));
  });

  test("the implementer may not move a task into verifying", () => {
    const f = withMutated(STATE_MACHINE_FILE, (d) => {
      d.transitions.push({ from: "in_review", to: "verifying", actor: "implementer", gates: ["reviews_approve"] });
    });
    const { problems } = loadStateMachine({ file: f, enums });
    assert.ok(problems.some((p) => p.message === 'implementer may not move a task into "verifying"'));
  });

  test("only humans may move a task into done, from any state", () => {
    const f = withMutated(STATE_MACHINE_FILE, (d) => {
      d.transitions.push({ from: "verifying", to: "done", actor: "coordinator", gates: [...d.mandatory_gates.done] });
    });
    const { problems } = loadStateMachine({ file: f, enums });
    assert.ok(problems.some((p) => p.message === 'only humans may move a task into done (from "verifying")'));
  });

  test("an unused gate is reported", () => {
    const f = withMutated(STATE_MACHINE_FILE, (d) => {
      d.gates.orphan = { description: "x", status: "planned" };
    });
    const { problems } = loadStateMachine({ file: f, enums });
    assert.ok(problems.some((p) => p.path === "/gates/orphan" && /no transition uses it/.test(p.message)));
  });

  test("a policy file that is not a mapping is a problem, not a crash", async () => {
    for (const text of ["", "- a\n- b\n", "just text\n"]) {
      const f = withText(text);
      assert.ok(loadStateMachine({ file: f, enums }).problems.some((p) => p.path === "/" && /must be a YAML mapping/.test(p.message)));
      assert.ok(loadApprovals({ file: f, enums }).problems.some((p) => p.path === "/" && /must be a YAML mapping/.test(p.message)));
    }
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cp-empty-policy-"));
    fs.mkdirSync(path.join(dir, ".github/control-plane/orchestration"), { recursive: true });
    fs.mkdirSync(path.join(dir, ".github/control-plane/policies"), { recursive: true });
    fs.writeFileSync(path.join(dir, ".github/control-plane/orchestration/state-machine.yaml"), "");
    fs.writeFileSync(path.join(dir, ".github/control-plane/policies/approvals.yaml"), "");
    for (const format of ["text", "json"]) {
      const c = capture();
      assert.equal(await main(["policy", "check", "--project", dir, "--format", format], c.io), EXIT.FAILED, format);
    }
  });

  test("security_review and required_reviews must agree", () => {
    const f = withMutated(APPROVALS_FILE, (d) => {
      d.by_risk.low.security_review = "required";
    });
    const { problems } = loadApprovals({ file: f, enums });
    assert.ok(problems.some((p) => p.path === "/by_risk/low/security_review" && /disagrees with required_reviews/.test(p.message)));
  });

  test("security review cannot be optional at medium risk", () => {
    const f = withMutated(APPROVALS_FILE, (d) => {
      d.by_risk.medium.security_review = "optional";
      d.by_risk.medium.required_reviews = ["code", "verification"];
    });
    const { problems } = loadApprovals({ file: f, enums });
    assert.ok(problems.some((p) => p.path === "/by_risk/medium/security_review" && /required at medium risk and above/.test(p.message)));
  });

  test("required reviews never shrink as risk rises", () => {
    const f = withMutated(APPROVALS_FILE, (d) => {
      d.by_risk.high.required_reviews = ["code", "verification"];
      d.by_risk.high.security_review = "optional";
    });
    const { problems } = loadApprovals({ file: f, enums });
    assert.ok(problems.some((p) => p.path === "/by_risk/high/required_reviews" && /drops review "security" required at medium/.test(p.message)));
  });

  test("always-human globs that can never match a normalized path are rejected", () => {
    for (const glob of ["./.github/workflows/**", ".github//workflows/**", "src/../.github/**", "src/./x"]) {
      const f = withMutated(APPROVALS_FILE, (d) => {
        d.always_human[0].paths.push(glob);
      });
      const { problems } = loadApprovals({ file: f, enums });
      assert.ok(problems.some((p) => /must not contain \.\/, \/\/ or \.\. segments/.test(p.message)), glob);
    }
  });

  test("every risk level requires the reviews the state machine makes mandatory", () => {
    const f = withMutated(APPROVALS_FILE, (d) => {
      d.by_risk.low.required_reviews = ["code"];
    });
    const { problems } = checkPolicies({ approvalsFile: f });
    assert.ok(problems.some((p) => p.path === "/by_risk/low/required_reviews" && /must include "verification"/.test(p.message)));
  });

  test("CI, infrastructure and billing tags need plan and merge decisions", () => {
    const { approvals } = checkPolicies();
    for (const tag of ["ci_cd", "infra", "billing"]) {
      const out = requiredHumanStages(approvals, { risk: { level: "low", tags: [tag] } });
      assert.deepEqual(out.stages, ["plan", "merge"], tag);
      assert.ok(out.reasons.includes("ci_infrastructure_and_spending"), tag);
    }
  });

  test("prompts, hooks, review domains, registries, glossary and decisions are protected paths", () => {
    const { approvals } = checkPolicies();
    for (const file of [".github/prompts/review.prompt.md", ".github/hooks/tool-policy.json", "scripts/hooks/pre-tool.js",
      ".review-domains.json", ".gitattributes", ".agents.registry.json", ".skills.registry.json", ".workflows.registry.json",
      "GLOSSARY.md", "docs/decisions/0003-agent-operating-limits.md"]) {
      assert.deepEqual(requiredHumanStages(approvals, { risk: { level: "low" }, paths: [file] }).stages, ["plan", "merge"], file);
    }
  });

  test("Rust build-time files count as supply chain", () => {
    const { approvals } = checkPolicies();
    for (const file of ["Cargo.toml", "firmware/crates/wallet-core/Cargo.toml", "firmware/build.rs", ".cargo/config.toml", "firmware/rust-toolchain.toml"]) {
      assert.ok(requiredHumanStages(approvals, { risk: { level: "low" }, paths: [file] }).reasons.includes("supply_chain"), file);
    }
  });

  test("inherited object keys are not risk levels", async () => {
    const { approvals } = checkPolicies();
    assert.deepEqual(requiredHumanStages(approvals, { risk: { level: "constructor" } }), { stages: [], reasons: [] });
    for (const risk of ["constructor", "toString", "__proto__"]) {
      assert.equal(await main(["policy", "stages", "--risk", risk], capture().io), EXIT.ERROR, risk);
    }
  });

  test("policy commands reject an unknown format", async () => {
    assert.equal(await main(["policy", "check", "--format", "yaml"], capture().io), EXIT.ERROR);
    assert.equal(await main(["policy", "stages", "--risk", "low", "--format", "yaml"], capture().io), EXIT.ERROR);
  });

  test("policy stages refuses to answer from an invalid policy", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cp-bad-policy-"));
    fs.mkdirSync(path.join(dir, ".github/control-plane/orchestration"), { recursive: true });
    fs.mkdirSync(path.join(dir, ".github/control-plane/policies"), { recursive: true });
    fs.copyFileSync(STATE_MACHINE_FILE, path.join(dir, ".github/control-plane/orchestration/state-machine.yaml"));
    const bad = YAML.parse(fs.readFileSync(APPROVALS_FILE, "utf8"));
    bad.by_risk.medium.security_review = "optional";
    fs.writeFileSync(path.join(dir, ".github/control-plane/policies/approvals.yaml"), YAML.stringify(bad));
    const c = capture();
    assert.equal(await main(["policy", "stages", "--project", dir, "--risk", "low"], c.io), EXIT.FAILED);
    assert.match(c.err.join("\n"), /policy files are invalid/);
  });

  test("double stars match line terminators, as single stars always did", () => {
    for (const sep of ["\n", "\r", " ", " "]) {
      assert.ok(globMatch(".github/workflows/**", `.github/workflows/x${sep}y.yml`), JSON.stringify(sep));
      assert.ok(globMatch("src/secret/**", `src/secret/k${sep}.js`), JSON.stringify(sep));
    }
    const { approvals } = checkPolicies();
    assert.deepEqual(requiredHumanStages(approvals, { risk: { level: "low" }, paths: [".github/workflows/x\ny.yml"] }).stages, ["plan", "merge"]);
  });

  test("matching cost stays linear for inputs with many stars", () => {
    const started = Date.now();
    assert.equal(globMatch(".github/control-plane/**", `${"*".repeat(400)}Z`), false);
    assert.equal(globMatch(`${"*".repeat(400)}Z`, ".github/control-plane/**"), false);
    assert.equal(globMatch(`${"*a".repeat(60)}b`, "a".repeat(500)), false);
    assert.ok(Date.now() - started < 1000, `took ${Date.now() - started} ms`);
  });
});
