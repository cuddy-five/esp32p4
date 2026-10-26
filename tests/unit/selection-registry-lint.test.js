import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { Registry } from '../../src/lib/registry.js';

const registry = new Registry();
const kinds = { workflow: 'workflows', agent: 'agents', skill: 'skills' };

test('descriptions are decision rules: bounded, unique, with Choose/Not', () => {
  for (const key of Object.values(kinds)) {
    const seen = new Set();
    for (const e of registry.loadRegistry(key)[key].filter((x) => x.enabled)) {
      assert.ok(e.description.length >= 40 && e.description.length <= 300, `${key}/${e.id} length`);
      assert.match(e.description, /^Choose /, `${key}/${e.id} starts with Choose`);
      assert.ok(!seen.has(e.description), `${key}/${e.id} description unique`);
      seen.add(e.description);
    }
  }
});

test('evaluation cases only expect ids that exist in the registry', () => {
  const cases = JSON.parse(readFileSync(new URL('../live/jev-selection-cases.json', import.meta.url)));
  assert.ok(cases.length >= 10);
  const ids = new Set();
  for (const c of cases) {
    assert.ok(!ids.has(c.id), `duplicate case ${c.id}`);
    ids.add(c.id);
    for (const [kind, key] of Object.entries(kinds)) {
      const want = c.expected[kind];
      if (want == null) continue;
      assert.ok(
        registry.loadRegistry(key)[key].some((e) => e.id === want && e.enabled),
        `${c.id}: ${kind} ${want} not in registry`,
      );
    }
  }
});

test('agents declare required budgets and scopes', () => {
  const agents = registry.loadRegistry('agents').agents;
  for (const agent of agents) {
    assert.ok(agent.budget?.max_tokens_per_request, `${agent.id} missing max_tokens_per_request`);
    assert.ok(Array.isArray(agent.scope?.allowed_paths), `${agent.id} missing allowed_paths`);
    assert.ok(Array.isArray(agent.scope?.forbidden_paths), `${agent.id} missing forbidden_paths`);
  }
});

test('workflows declare transitions', () => {
  const workflows = registry.loadRegistry('workflows').workflows;
  for (const workflow of workflows) {
    assert.ok(workflow.transitions && typeof workflow.transitions === 'object', `${workflow.id} missing transitions`);
    assert.ok(Object.keys(workflow.transitions).length > 0, `${workflow.id} has empty transitions`);
  }
});

test('skills declare cost information', () => {
  const skills = registry.loadRegistry('skills').skills;
  for (const skill of skills) {
    assert.ok(skill.cost, `${skill.id} missing cost`);
    assert.strictEqual(typeof skill.cost.ai_credits, 'number', `${skill.id} cost ai_credits is number`);
    assert.ok(skill.cost.description, `${skill.id} missing cost description`);
  }
});

test('the reviewer can be selected, cannot write, and is not the implementer family', () => {
  const reviewer = registry.lookupAgent('reviewer');
  const implementer = registry.lookupAgent('implementer');
  assert.equal(reviewer.enabled, true);
  assert.deepEqual(reviewer.scope.allowed_paths, []);
  assert.equal(reviewer.approval_rules.min_approval_level, 'owner');
  assert.notEqual(reviewer.model.split('-')[0], implementer.model.split('-')[0]);
});

test('security_auditor and verifier are non-writing roles and implementer allows root markdown', () => {
  const auditor = registry.lookupAgent('security_auditor');
  const verifier = registry.lookupAgent('verifier');
  const implementer = registry.lookupAgent('implementer');

  assert.equal(auditor.enabled, true);
  assert.deepEqual(auditor.scope.allowed_paths, []);
  assert.equal(verifier.enabled, true);
  assert.deepEqual(verifier.scope.allowed_paths, []);
  assert.ok(implementer.scope.allowed_paths.includes('*.md'));
});
