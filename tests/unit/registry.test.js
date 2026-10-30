import { test } from 'node:test';
import assert from 'node:assert';
import { Registry, RegistryError } from '../../src/lib/registry.js';

const registry = new Registry();

test('Registry - Load agents registry', async () => {
  const agents = registry.loadRegistry('agents');
  assert.ok(agents, 'agents registry loaded');
  assert.ok(Array.isArray(agents.agents), 'agents is an array');
  assert.ok(agents.agents.length > 0, 'at least one agent exists');
});

test('Registry - Load workflows registry', async () => {
  const workflows = registry.loadRegistry('workflows');
  assert.ok(workflows, 'workflows registry loaded');
  assert.ok(Array.isArray(workflows.workflows), 'workflows is an array');
  assert.ok(workflows.workflows.length > 0, 'at least one workflow exists');
});

test('Registry - Load skills registry', async () => {
  const skills = registry.loadRegistry('skills');
  assert.ok(skills, 'skills registry loaded');
  assert.ok(Array.isArray(skills.skills), 'skills is an array');
  assert.ok(skills.skills.length > 0, 'at least one skill exists');
});

test('Registry - Schema validation rejects malformed data', async () => {
  assert.throws(
    () => registry.validateRegistry({ agents: [{ id: 'bad' }] }, 'agents'),
    (err) => err instanceof RegistryError && err.message.includes('Schema validation failed'),
  );
});

test('Registry - Invalid registry type throws error', async () => {
  assert.throws(
    () => registry.loadRegistry('invalid'),
    (err) => err instanceof RegistryError && err.message.includes('Invalid registry type'),
    'invalid type throws RegistryError',
  );
});

test('Registry - Lookup agent by name', async () => {
  const agent = registry.lookupAgent('planner');
  assert.strictEqual(agent.id, 'planner', 'found planner agent');
  assert.strictEqual(agent.name, 'Planner', 'planner has correct name');
  assert.ok(agent.model, 'planner has a model');
});

test('Registry - Lookup missing agent throws error', async () => {
  assert.throws(
    () => registry.lookupAgent('nonexistent'),
    (err) => err instanceof RegistryError && err.message.includes('Agent not found'),
    'missing agent throws error',
  );
});

test('Registry - Lookup workflow by name', async () => {
  const workflow = registry.lookupWorkflow('intake');
  assert.strictEqual(workflow.id, 'intake', 'found intake workflow');
  assert.strictEqual(workflow.name, 'Request Intake', 'intake has correct name');
});

test('Registry - Lookup missing workflow throws error', async () => {
  assert.throws(
    () => registry.lookupWorkflow('nonexistent'),
    (err) => err instanceof RegistryError && err.message.includes('Workflow not found'),
    'missing workflow throws error',
  );
});

test('Registry - Lookup skill by name', async () => {
  const skill = registry.lookupSkill('code-reviewer');
  assert.strictEqual(skill.id, 'code-reviewer', 'found code-reviewer skill');
  assert.strictEqual(skill.name, 'Code Reviewer', 'code-reviewer has correct name');
});

test('Registry - Lookup missing skill throws error', async () => {
  assert.throws(
    () => registry.lookupSkill('nonexistent'),
    (err) => err instanceof RegistryError && err.message.includes('Skill not found'),
    'missing skill throws error',
  );
});

test('Registry - listMethods return {id, name} summary pairs for enabled items', async () => {
  for (const [method, type] of [['listAgents', 'agents'], ['listWorkflows', 'workflows'], ['listSkills', 'skills']]) {
    const list = registry[method]();
    assert.ok(Array.isArray(list), `${method} returns array`);
    assert.ok(list.length > 0, `${method} has items`);
    assert.ok(list.every((item) => item.id && item.name), `${method} items have id and name`);
  }
});

test('Registry - getEnabledMethods return full enabled entity objects', async () => {
  for (const method of ['getEnabledAgents', 'getEnabledWorkflows', 'getEnabledSkills']) {
    const list = registry[method]();
    assert.ok(Array.isArray(list), `${method} returns array`);
    assert.ok(list.length > 0, `${method} has items`);
    assert.ok(list.every((item) => item.enabled === true), `${method} items are enabled`);
  }
});

test('Registry - Find skills by category and tag', async () => {
  const reviewSkills = registry.findSkillsByCategory('review');
  assert.ok(Array.isArray(reviewSkills), 'findSkillsByCategory returns array');
  assert.ok(reviewSkills.length > 0, 'at least one review skill found');
  assert.ok(reviewSkills.every((s) => s.category === 'review'), 'all skills have review category');

  const securitySkills = registry.findSkillsByTag('security');
  assert.ok(Array.isArray(securitySkills), 'findSkillsByTag returns array');
  assert.ok(securitySkills.length > 0, 'at least one security-tagged skill found');
  assert.ok(securitySkills.every((s) => s.tags && s.tags.includes('security')), 'all skills have security tag');
});

test('Registry - Get workflows by risk level filters correctly', async () => {
  const highRisk = registry.getWorkflowsByRiskLevel('high');
  assert.ok(Array.isArray(highRisk), 'getWorkflowsByRiskLevel returns array');
  assert.ok(highRisk.length > 0, 'at least one high risk workflow found');
  assert.ok(
    highRisk.every((w) => Array.isArray(w.required_for_risk_levels) && w.required_for_risk_levels.includes('high')),
    'all returned workflows require high risk',
  );
});

test('Registry - Cache memoizes loaded registries and invalidates on clearCache', async () => {
  registry.clearCache();
  assert.ok(!registry.cache.has('agents'), 'cache empty initially');
  const agents1 = registry.loadRegistry('agents');
  assert.ok(registry.cache.has('agents'), 'cache populated after load');
  const agents2 = registry.loadRegistry('agents');
  assert.strictEqual(agents1, agents2, 'cached registry returns same reference');
  registry.clearCache();
  assert.ok(!registry.cache.has('agents'), 'cache empty after clear');
});

test("Registry - a registry without its own array or with duplicate ids is rejected", async () => {
  const fs = await import("node:fs");
  const os = await import("node:os");
  const path = await import("node:path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cp-registry-"));
  fs.writeFileSync(path.join(dir, ".skills.registry.json"), JSON.stringify({ schema_version: 1 }));
  assert.throws(() => new Registry({ rootDir: dir }).lookupSkill("x"), /must contain a "skills" array/);
  const agent = { id: "a", name: "A", description: "d", model: "kimi-k3", budget: { max_ai_credits: 100, max_tokens_per_request: 1000, max_concurrent_tasks: 1 }, scope: { allowed_paths: [], forbidden_paths: [] }, enabled: true };
  fs.writeFileSync(path.join(dir, ".agents.registry.json"), JSON.stringify({ schema_version: 1, agents: [agent, agent] }));
  assert.throws(() => new Registry({ rootDir: dir }).listAgents(), /Duplicate agents id: a/);
});
