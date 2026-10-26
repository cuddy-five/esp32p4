import { test } from 'node:test';
import assert from 'node:assert';
import { Registry, RegistryError } from '../../src/lib/registry.js';

const registry = new Registry();

test('Registry - Load agents registry', async (t) => {
  const agents = registry.loadRegistry('agents');
  assert.ok(agents, 'agents registry loaded');
  assert.ok(Array.isArray(agents.agents), 'agents is an array');
  assert.ok(agents.agents.length > 0, 'at least one agent exists');
});

test('Registry - Load workflows registry', async (t) => {
  const workflows = registry.loadRegistry('workflows');
  assert.ok(workflows, 'workflows registry loaded');
  assert.ok(Array.isArray(workflows.workflows), 'workflows is an array');
  assert.ok(workflows.workflows.length > 0, 'at least one workflow exists');
});

test('Registry - Load skills registry', async (t) => {
  const skills = registry.loadRegistry('skills');
  assert.ok(skills, 'skills registry loaded');
  assert.ok(Array.isArray(skills.skills), 'skills is an array');
  assert.ok(skills.skills.length > 0, 'at least one skill exists');
});

test('Registry - Schema validation passes', async (t) => {
  const agents = registry.loadRegistry('agents');
  registry.validateRegistry(agents, 'agents');
  assert.ok(true, 'agents registry passed schema validation');

  const workflows = registry.loadRegistry('workflows');
  registry.validateRegistry(workflows, 'workflows');
  assert.ok(true, 'workflows registry passed schema validation');

  const skills = registry.loadRegistry('skills');
  registry.validateRegistry(skills, 'skills');
  assert.ok(true, 'skills registry passed schema validation');
});

test('Registry - Invalid registry type throws error', async (t) => {
  assert.throws(
    () => registry.loadRegistry('invalid'),
    (err) => err instanceof RegistryError && err.message.includes('Invalid registry type'),
    'invalid type throws RegistryError'
  );
});

test('Registry - Lookup agent by name', async (t) => {
  const agent = registry.lookupAgent('planner');
  assert.strictEqual(agent.id, 'planner', 'found planner agent');
  assert.strictEqual(agent.name, 'Planner', 'planner has correct name');
  assert.ok(agent.model, 'planner has a model');
});

test('Registry - Lookup missing agent throws error', async (t) => {
  assert.throws(
    () => registry.lookupAgent('nonexistent'),
    (err) => err instanceof RegistryError && err.message.includes('Agent not found'),
    'missing agent throws error'
  );
});

test('Registry - Lookup workflow by name', async (t) => {
  const workflow = registry.lookupWorkflow('intake');
  assert.strictEqual(workflow.id, 'intake', 'found intake workflow');
  assert.strictEqual(workflow.name, 'Request Intake', 'intake has correct name');
});

test('Registry - Lookup missing workflow throws error', async (t) => {
  assert.throws(
    () => registry.lookupWorkflow('nonexistent'),
    (err) => err instanceof RegistryError && err.message.includes('Workflow not found'),
    'missing workflow throws error'
  );
});

test('Registry - Lookup skill by name', async (t) => {
  const skill = registry.lookupSkill('code-reviewer');
  assert.strictEqual(skill.id, 'code-reviewer', 'found code-reviewer skill');
  assert.strictEqual(skill.name, 'Code Reviewer', 'code-reviewer has correct name');
});

test('Registry - Lookup missing skill throws error', async (t) => {
  assert.throws(
    () => registry.lookupSkill('nonexistent'),
    (err) => err instanceof RegistryError && err.message.includes('Skill not found'),
    'missing skill throws error'
  );
});

test('Registry - List enabled agents', async (t) => {
  const agents = registry.listAgents();
  assert.ok(Array.isArray(agents), 'listAgents returns array');
  assert.ok(agents.length > 0, 'at least one agent listed');
  assert.ok(agents.every(a => a.id && a.name), 'all agents have id and name');
  assert.ok(agents.every(a => a.id === 'planner' || a.id === 'implementer' || a.id === 'reviewer' || a.id === 'security_auditor' || a.id === 'verifier'), 'agents are expected ones');
});

test('Registry - List enabled workflows', async (t) => {
  const workflows = registry.listWorkflows();
  assert.ok(Array.isArray(workflows), 'listWorkflows returns array');
  assert.ok(workflows.length > 0, 'at least one workflow listed');
  assert.ok(workflows.every(w => w.id && w.name), 'all workflows have id and name');
});

test('Registry - List enabled skills', async (t) => {
  const skills = registry.listSkills();
  assert.ok(Array.isArray(skills), 'listSkills returns array');
  assert.ok(skills.length > 0, 'at least one skill listed');
  assert.ok(skills.every(s => s.id && s.name), 'all skills have id and name');
});

test('Registry - Get all enabled agents', async (t) => {
  const agents = registry.getEnabledAgents();
  assert.ok(Array.isArray(agents), 'getEnabledAgents returns array');
  assert.ok(agents.every(a => a.enabled === true), 'all agents have enabled: true');
});

test('Registry - Get all enabled workflows', async (t) => {
  const workflows = registry.getEnabledWorkflows();
  assert.ok(Array.isArray(workflows), 'getEnabledWorkflows returns array');
  assert.ok(workflows.every(w => w.enabled === true), 'all workflows have enabled: true');
});

test('Registry - Get all enabled skills', async (t) => {
  const skills = registry.getEnabledSkills();
  assert.ok(Array.isArray(skills), 'getEnabledSkills returns array');
  assert.ok(skills.every(s => s.enabled === true), 'all skills have enabled: true');
});

test('Registry - Find skills by category', async (t) => {
  const reviewSkills = registry.findSkillsByCategory('review');
  assert.ok(Array.isArray(reviewSkills), 'findSkillsByCategory returns array');
  assert.ok(reviewSkills.length > 0, 'at least one review skill found');
  assert.ok(reviewSkills.every(s => s.category === 'review'), 'all skills have review category');
});

test('Registry - Find skills by tag', async (t) => {
  const securitySkills = registry.findSkillsByTag('security');
  assert.ok(Array.isArray(securitySkills), 'findSkillsByTag returns array');
  assert.ok(securitySkills.length > 0, 'at least one security-tagged skill found');
  assert.ok(securitySkills.every(s => s.tags && s.tags.includes('security')), 'all skills have security tag');
});

test('Registry - Get workflows by risk level', async (t) => {
  const securityWorkflows = registry.getWorkflowsByRiskLevel('high');
  assert.ok(Array.isArray(securityWorkflows), 'getWorkflowsByRiskLevel returns array');
});

test('Registry - Cache behavior', async (t) => {
  registry.clearCache();
  const agents1 = registry.loadRegistry('agents');
  const agents2 = registry.loadRegistry('agents');
  assert.strictEqual(agents1, agents2, 'cached registry returns same object');
});

test('Registry - Clear cache', async (t) => {
  registry.loadRegistry('agents');
  assert.ok(registry.cache.has('agents'), 'cache has agents before clear');
  registry.clearCache();
  assert.ok(!registry.cache.has('agents'), 'cache empty after clear');
});

test('Registry - Agent budget requirements', async (t) => {
  const agent = registry.lookupAgent('implementer');
  assert.ok(agent.budget.max_ai_credits, 'agent has max_ai_credits');
  assert.ok(agent.budget.max_tokens_per_request, 'agent has max_tokens_per_request');
  assert.ok(agent.budget.max_concurrent_tasks, 'agent has max_concurrent_tasks');
});

test('Registry - Agent scope requirements', async (t) => {
  const agent = registry.lookupAgent('planner');
  assert.ok(Array.isArray(agent.scope.allowed_paths), 'agent has allowed_paths');
  assert.ok(Array.isArray(agent.scope.forbidden_paths), 'agent has forbidden_paths');
});

test('Registry - Workflow transitions are valid', async (t) => {
  const workflow = registry.lookupWorkflow('plan-review');
  assert.ok(workflow.transitions, 'workflow has transitions');
  assert.ok(Object.keys(workflow.transitions).length > 0, 'workflow has at least one transition');
});

test('Registry - Skills have cost information', async (t) => {
  const skill = registry.lookupSkill('code-reviewer');
  assert.ok(skill.cost, 'skill has cost');
  assert.strictEqual(typeof skill.cost.ai_credits, 'number', 'cost has ai_credits number');
  assert.ok(skill.cost.description, 'cost has description');
});
