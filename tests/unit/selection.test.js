import { test } from "node:test";
import assert from "node:assert";
import { Registry } from "../../src/lib/registry.js";
import {
  buildSelectionRequest,
  interpretSelectionResponse,
} from "../../src/selection.js";
import {
  buildIntakeRequest,
  checkNoulAnswer,
  checkScoreAnswer,
  interpretIntakeResponse,
  splitNoul,
} from "../../src/routing.js";

const entry = (id) => ({ id, name: id, description: `${id} description` });
const fake = ({
  workflows = [entry("implement"), entry("intake")],
  agents = [entry("planner"), entry("verifier")],
  skills = [entry("tdd-guide")],
} = {}) => ({
  getEnabledWorkflows: () => workflows,
  getEnabledAgents: () => agents,
  getEnabledSkills: () => skills,
});

const pie = (options, choice, top = 0.8) => {
  const rest = (1 - top) / (options.length - 1);
  return Object.fromEntries(options.map((o) => [o, o === choice ? top : rest]));
};
const answer = (request, name, choice, confidence = 0.8) => {
  const options = Object.keys(request.questions[name].criteria);
  return { type: "choice", choice, confidence, probabilities: pie(options, choice, confidence) };
};
const respond = (request, choices, confidence) => ({
  model: "jev-test",
  usage: { input_tokens: 10, output_tokens: 2 },
  answers: Object.fromEntries(
    Object.entries(choices).map(([n, c]) => [n, answer(request, n, c, confidence)]),
  ),
});

test("interpret: confident picks are advisory and need human review", () => {
  const req = buildSelectionRequest("x", "m", fake());
  const out = interpretSelectionResponse(
    respond(req, { workflow: "implement", agent: "planner", skill: "tdd-guide" }, 0.9),
    req,
  );
  assert.equal(out.mode, "advisory");
  assert.equal(out.disposition, "human_review");
  assert.equal(out.selections.workflow.choice, "implement");
  assert.equal(out.resolved_model, "jev-test");
});

test("interpret: none or low confidence asks for clarification", () => {
  const req = buildSelectionRequest("x", "m", fake());
  const none = interpretSelectionResponse(
    respond(req, { workflow: "none", agent: "planner", skill: "tdd-guide" }, 0.9),
    req,
  );
  assert.equal(none.disposition, "clarify");
  assert.equal(none.selections.workflow.choice, null);
  const low = interpretSelectionResponse(
    respond(req, { workflow: "implement", agent: "planner", skill: "tdd-guide" }, 0.5),
    req,
  );
  assert.equal(low.disposition, "clarify");
  assert.throws(
    () =>
      interpretSelectionResponse(
        respond(req, { workflow: "implement", agent: "planner", skill: "tdd-guide" }),
        req,
        { minConfidence: 2 },
      ),
    RangeError,
  );
});

test("interpret: rejects unknown ids, missing answers and bad probabilities", () => {
  const req = buildSelectionRequest("x", "m", fake());
  const good = respond(req, { workflow: "implement", agent: "planner", skill: "tdd-guide" });
  const bad = structuredClone(good);
  bad.answers.agent.choice = "root-admin";
  assert.throws(() => interpretSelectionResponse(bad, req), /invalid agent answer/);

  const missing = structuredClone(good);
  delete missing.answers.skill;
  assert.throws(() => interpretSelectionResponse(missing, req), /invalid skill answer/);

  const skewed = structuredClone(good);
  skewed.answers.workflow.probabilities.intake = 0.9;
  assert.throws(() => interpretSelectionResponse(skewed, req), /inconsistent/);
  assert.throws(() => interpretSelectionResponse(null, req), /invalid/);
});

test("build: sanitizes descriptions and rejects bad or duplicate ids", () => {
  const req = buildSelectionRequest(
    "x",
    "m",
    fake({ workflows: [{ id: "implement", description: `Do\nthis\u0000 ${"a".repeat(500)}` }] }),
  );
  const text = req.questions.workflow.criteria.implement;
  assert.ok(text.length <= 300 && !/[\u0000-\u001f]/.test(text));
  for (const id of ["__proto__", "a b", "", 5]) {
    assert.throws(() => buildSelectionRequest("x", "m", fake({ agents: [{ id }] })), /invalid id/);
  }
  assert.throws(
    () => buildSelectionRequest("x", "m", fake({ agents: [entry("planner"), entry("planner")] })),
    /duplicated/,
  );
  assert.throws(
    () => buildSelectionRequest("x", "m", { ...fake(), getEnabledSkills: () => undefined }),
    /must be a list/,
  );
});

test("interpret: a none skill alone does not force clarification", () => {
  const req = buildSelectionRequest("x", "m", fake());
  const out = interpretSelectionResponse(
    respond(req, { workflow: "implement", agent: "planner", skill: "none" }, 0.9),
    req,
  );
  assert.equal(out.disposition, "human_review");
  assert.equal(out.selections.skill.choice, null);
});

test("interpret: low skill confidence does not force clarification", () => {
  const req = buildSelectionRequest("x", "m", fake());
  const picked = respond(req, { workflow: "implement", agent: "planner", skill: "none" }, 0.9);
  picked.answers.skill = answer(req, "skill", "tdd-guide", 0.55);
  const out = interpretSelectionResponse(picked, req);
  assert.equal(out.disposition, "human_review");
  assert.equal(out.selections.workflow.choice, "implement");
  assert.equal(out.selections.agent.choice, "planner");
  assert.equal(out.selections.skill.choice, "tdd-guide");
  assert.equal(out.selections.skill.confidence, 0.55);

  const none = respond(req, { workflow: "implement", agent: "planner", skill: "none" }, 0.9);
  none.answers.skill = answer(req, "skill", "none", 0.55);
  const noneOut = interpretSelectionResponse(none, req);
  assert.equal(noneOut.disposition, "human_review");
  assert.equal(noneOut.selections.skill.choice, null);
});

test("intake: interpretIntakeResponse validates, gates on minConfidence, and handles prompt_injection", () => {
  const req = buildIntakeRequest("fix bug", "m");
  const options = Object.keys(req.questions.intent.criteria);
  const ok = {
    model: "m",
    usage: { input_tokens: 1, output_tokens: 1 },
    answers: { intent: answer(req, "intent", "change_request", 0.7) },
  };
  assert.equal(interpretIntakeResponse(ok, req).choice, "change_request");
  assert.equal(interpretIntakeResponse(ok, req).disposition, "human_review");

  // Low confidence on a non-unclear choice still forces clarification
  const lowConf = {
    model: "m",
    usage: { input_tokens: 1, output_tokens: 1 },
    answers: { intent: answer(req, "intent", "change_request", 0.45) },
  };
  assert.equal(interpretIntakeResponse(lowConf, req).disposition, "clarify");

  ok.answers.intent.choice = "nope";
  assert.throws(() => interpretIntakeResponse(ok, req), /invalid intake answer/);
  assert.equal(options.length, 4);
});

test("primitives: checkNoulAnswer, splitNoul, and checkScoreAnswer validate and split", () => {
  assert.deepEqual(splitNoul(0.85), { probability: 0.85, confidence: 0.7, verdict: "yes" });
  assert.deepEqual(splitNoul(0.1), { probability: 0.1, confidence: 0.8, verdict: "no" });
  assert.deepEqual(splitNoul(0.5), { probability: 0.5, confidence: 0, verdict: "uncertain" });
  assert.throws(() => checkNoulAnswer({ type: "noul", noul: 1.5 }, "inj"), /invalid inj answer/);

  const rubric = ["low", "med", "high"];
  const validScore = {
    type: "score",
    score: 1.2,
    confidence: 0.85,
    probabilities: [0.1, 0.7, 0.2],
  };
  assert.equal(checkScoreAnswer(validScore, rubric, "blast").score, 1.2);
  assert.throws(
    () => checkScoreAnswer({ ...validScore, probabilities: [0.5, 0.5] }, rubric, "blast"),
    /invalid blast answer/,
  );
});

test("guardrails: speculative fan-out evaluates injection, blast_radius score, and risk tags", () => {
  const req = buildSelectionRequest("Audit API key handling", "m", fake(), { includeGuardrails: true });
  const base = respond(req, { workflow: "implement", agent: "planner", skill: "tdd-guide" }, 0.9);
  base.answers.prompt_injection = { type: "noul", noul: 0.05 };
  base.answers.blast_radius = {
    type: "score",
    score: 2.8,
    confidence: 0.88,
    probabilities: [0.02, 0.05, 0.13, 0.8],
  };
  base.answers.tag_secrets_auth = { type: "noul", noul: 0.92 };
  base.answers.tag_ci_control_plane = { type: "noul", noul: 0.1 };
  base.answers.tag_dependencies = { type: "noul", noul: 0.05 };

  const out = interpretSelectionResponse(base, req);
  assert.equal(out.disposition, "human_review");
  assert.equal(out.guardrails.risk_level, "critical");
  assert.deepEqual(out.guardrails.risk_tags, ["secrets"]);

  // Uncertain or high prompt_injection Noul escalates to security
  const injected = structuredClone(base);
  injected.answers.prompt_injection = { type: "noul", noul: 0.52 };
  assert.equal(interpretSelectionResponse(injected, req).disposition, "escalate_security");
});