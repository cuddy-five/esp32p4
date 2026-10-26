import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import Ajv from "ajv";
import { REPO_ROOT } from "./paths.js";

export class RegistryError extends Error {
  constructor(message) {
    super(message);
    this.name = "RegistryError";
  }
}

export class Registry {
  constructor({ rootDir = REPO_ROOT } = {}) {
    this.rootDir = rootDir;
    this.cache = new Map();
    this.schema = null;
    this.validator = null;
  }

  loadSchema() {
    if (this.schema) return this.schema;
    const localSchema = path.join(this.rootDir, "docs", "agents", "registry.schema.json");
    const schemaPath = existsSync(localSchema)
      ? localSchema
      : path.join(REPO_ROOT, "docs", "agents", "registry.schema.json");
    const schemaText = readFileSync(schemaPath, "utf8");
    this.schema = JSON.parse(schemaText);
    const ajv = new Ajv();
    this.validator = ajv.compile(this.schema);
    return this.schema;
  }

  loadRegistry(type) {
    if (!["agents", "workflows", "skills"].includes(type)) {
      throw new RegistryError(`Invalid registry type: ${type}. Must be agents, workflows, or skills.`);
    }

    if (this.cache.has(type)) {
      return this.cache.get(type);
    }

    const filePath = path.join(this.rootDir, `.${type}.registry.json`);

    try {
      const content = readFileSync(filePath, "utf8");
      const data = JSON.parse(content);
      this.validateRegistry(data, type);
      this.cache.set(type, data);
      return data;
    } catch (err) {
      if (err instanceof RegistryError) throw err;
      if (err instanceof SyntaxError) {
        throw new RegistryError(`Invalid JSON in .${type}.registry.json: ${err.message}`);
      }
      throw new RegistryError(`Failed to load .${type}.registry.json: ${err.message}`);
    }
  }

  validateRegistry(data, type) {
    this.loadSchema();
    if (!this.validator(data)) {
      const errors = this.validator.errors.map((e) => `${e.instancePath} ${e.message}`).join("; ");
      throw new RegistryError(`Schema validation failed for ${type}: ${errors}`);
    }
  }

  lookupAgent(name) {
    const registry = this.loadRegistry("agents");
    const agent = registry.agents.find((a) => a.id === name);
    if (!agent) {
      throw new RegistryError(`Agent not found: ${name}`);
    }
    return agent;
  }

  lookupWorkflow(name) {
    const registry = this.loadRegistry("workflows");
    const workflow = registry.workflows.find((w) => w.id === name);
    if (!workflow) {
      throw new RegistryError(`Workflow not found: ${name}`);
    }
    return workflow;
  }

  lookupSkill(name) {
    const registry = this.loadRegistry("skills");
    const skill = registry.skills.find((s) => s.id === name);
    if (!skill) {
      throw new RegistryError(`Skill not found: ${name}`);
    }
    return skill;
  }

  listAgents() {
    const registry = this.loadRegistry("agents");
    return registry.agents.filter((a) => a.enabled).map((a) => ({ id: a.id, name: a.name }));
  }

  listWorkflows() {
    const registry = this.loadRegistry("workflows");
    return registry.workflows.filter((w) => w.enabled).map((w) => ({ id: w.id, name: w.name }));
  }

  listSkills() {
    const registry = this.loadRegistry("skills");
    return registry.skills.filter((s) => s.enabled).map((s) => ({ id: s.id, name: s.name }));
  }

  getEnabledAgents() {
    const registry = this.loadRegistry("agents");
    return registry.agents.filter((a) => a.enabled);
  }

  getEnabledWorkflows() {
    const registry = this.loadRegistry("workflows");
    return registry.workflows.filter((w) => w.enabled);
  }

  getEnabledSkills() {
    const registry = this.loadRegistry("skills");
    return registry.skills.filter((s) => s.enabled);
  }

  findSkillsByCategory(category) {
    const registry = this.loadRegistry("skills");
    return registry.skills.filter((s) => s.enabled && s.category === category);
  }

  findSkillsByTag(tag) {
    const registry = this.loadRegistry("skills");
    return registry.skills.filter((s) => s.enabled && s.tags && s.tags.includes(tag));
  }

  getWorkflowsByRiskLevel(riskLevel) {
    const registry = this.loadRegistry("workflows");
    return registry.workflows.filter(
      (w) => w.enabled && w.required_for_risk_levels && w.required_for_risk_levels.includes(riskLevel),
    );
  }

  clearCache() {
    this.cache.clear();
  }
}

export default new Registry();