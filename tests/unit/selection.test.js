import { test } from 'node:test';
import assert from 'node:assert';
import { Registry } from '../../src/lib/registry.js';
import {
  buildSelectionRequest,
  interpretSelectionResponse,
} from '../../src/selection.js';

const entry = (id) => ({ id, name: id, description: `${id} description` });
const fake = ({ workflows = [entry('implement'), entry('intake')],
  agents = [entry('planner'), entry('verifier')],
  skills = [entry('tdd-guide')] } = {}) => ({
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
  return { type: 'choice', choice, confidence, probabilities: pie(options, choice, confidence) };
};
const respond = (request, choices, confidence) => ({
  model: 'jev-test',
  usage: { input_tokens: 10, output_tokens: 2 },
  answers: Object.fromEntries(
    Object.entries(choices).map(([n, c]) => [n, answer(request, n, c, confidence)])),
});

test('build: options come only from enabled registry entries plus none', () => {
  const req = buildSelectionRequest('  fix the bug ', ' m ', fake());
  assert.equal(req.model, 'm');
  assert.equal(req.state.request, 'fix the bug');
  assert.deepEqual(Object.keys(req.questions), ['workflow', 'agent', 'skill']);
  assert.deepEqual(Object.keys(req.questions.workflow.criteria), ['implement', 'intake', 'none']);
  assert.equal(req.questions.agent.criteria.planner, 'planner description');
});

test('build: uses real registry and skips skill question when no skills', () => {
  const real = buildSelectionRequest('x', 'm', new Registry());
  assert.ok(Object.keys(real.questions.agent.criteria).includes('planner'));
  const req = buildSelectionRequest('x', 'm', fake({ skills: [] }));
  assert.equal(req.questions.skill, undefined);
});

test('build: rejects bad input and unusable registries', () => {
  assert.throws(() => buildSelectionRequest('', 'm', fake()), TypeError);
  assert.throws(() => buildSelectionRequest('x'.repeat(8001), 'm', fake()), RangeError);
  assert.throws(() => buildSelectionRequest('x', ' ', fake()), TypeError);
  assert.throws(() => buildSelectionRequest('x', 'm', fake({ agents: [] })), /No enabled agent/);
  assert.throws(() => buildSelectionRequest('x', 'm', fake({ workflows: [entry('none')] })), /reserved/);
});

test('interpret: confident picks are advisory and need human review', () => {
  const req = buildSelectionRequest('x', 'm', fake());
  const out = interpretSelectionResponse(
    respond(req, { workflow: 'implement', agent: 'planner', skill: 'tdd-guide' }, 0.9), req);
  assert.equal(out.mode, 'advisory');
  assert.equal(out.disposition, 'human_review');
  assert.equal(out.selections.workflow.choice, 'implement');
  assert.equal(out.resolved_model, 'jev-test');
});

test('interpret: none or low confidence asks for clarification', () => {
  const req = buildSelectionRequest('x', 'm', fake());
  const none = interpretSelectionResponse(
    respond(req, { workflow: 'none', agent: 'planner', skill: 'tdd-guide' }, 0.9), req);
  assert.equal(none.disposition, 'clarify');
  assert.equal(none.selections.workflow.choice, null);
  const low = interpretSelectionResponse(
    respond(req, { workflow: 'implement', agent: 'planner', skill: 'tdd-guide' }, 0.5), req);
  assert.equal(low.disposition, 'clarify');
  assert.throws(() => interpretSelectionResponse(
    respond(req, { workflow: 'implement', agent: 'planner', skill: 'tdd-guide' }), req,
    { minConfidence: 2 }), RangeError);
});

test('interpret: rejects unknown ids, missing answers and bad probabilities', () => {
  const req = buildSelectionRequest('x', 'm', fake());
  const good = respond(req, { workflow: 'implement', agent: 'planner', skill: 'tdd-guide' });
  const bad = structuredClone(good);
  bad.answers.agent.choice = 'root-admin';
  assert.throws(() => interpretSelectionResponse(bad, req), /invalid agent answer/);

  const missing = structuredClone(good);
  delete missing.answers.skill;
  assert.throws(() => interpretSelectionResponse(missing, req), /invalid skill answer/);

  const skewed = structuredClone(good);
  skewed.answers.workflow.probabilities.intake = 0.9;
  assert.throws(() => interpretSelectionResponse(skewed, req), /inconsistent/);
  assert.throws(() => interpretSelectionResponse(null, req), /invalid/);
});

test('build: sanitizes descriptions and rejects bad or duplicate ids', () => {
  const req = buildSelectionRequest('x', 'm', fake({
    workflows: [{ id: 'implement', description: `Do\nthis\u0000 ${'a'.repeat(500)}` }] }));
  const text = req.questions.workflow.criteria.implement;
  assert.ok(text.length <= 300 && !/[\u0000-\u001f]/.test(text));
  for (const id of ['__proto__', 'a b', '', 5]) {
    assert.throws(() => buildSelectionRequest('x', 'm', fake({ agents: [{ id }] })), /invalid id/);
  }
  assert.throws(() => buildSelectionRequest('x', 'm',
    fake({ agents: [entry('planner'), entry('planner')] })), /duplicated/);
  assert.throws(() => buildSelectionRequest('x', 'm',
    { ...fake(), getEnabledSkills: () => undefined }), /must be a list/);
});

test('interpret: a none skill alone does not force clarification', () => {
  const req = buildSelectionRequest('x', 'm', fake());
  const out = interpretSelectionResponse(
    respond(req, { workflow: 'implement', agent: 'planner', skill: 'none' }, 0.9), req);
  assert.equal(out.disposition, 'human_review');
  assert.equal(out.selections.skill.choice, null);
});

test('intake: interpretIntakeResponse still validates and returns advice', async () => {
  const { buildIntakeRequest, interpretIntakeResponse } = await import('../../src/routing.js');
  const req = buildIntakeRequest('fix bug', 'm');
  const options = Object.keys(req.questions.intent.criteria);
  const ok = { model: 'm', usage: { input_tokens: 1, output_tokens: 1 }, answers: { intent: answer(req, 'intent', 'change_request', 0.7) } };
  assert.equal(interpretIntakeResponse(ok, req).choice, 'change_request');
  ok.answers.intent.choice = 'nope';
  assert.throws(() => interpretIntakeResponse(ok, req), /invalid intake answer/);
  assert.equal(options.length, 4);
});

test('build: strips zero-width and bidi characters from descriptions', () => {
  const req = buildSelectionRequest('x', 'm', fake({
    workflows: [{ id: 'implement', description: 'Choose\u200b this\u202e now' }] }));
  assert.equal(req.questions.workflow.criteria.implement, 'Choose this now');
});
