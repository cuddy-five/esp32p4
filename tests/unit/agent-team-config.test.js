import { describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";

const agentsDir = ".github/agents";
const expectedAgents = [
  "coordinator", "planner", "implementer", "rust-coder",
  "reviewer", "security-auditor", "verifier", "custom-agent-foundry",
];
const supportedAliases = new Set(["read", "search", "edit", "execute", "web", "agent", "todo"]);

function readProfile(file) {
  const text = fs.readFileSync(file, "utf8");
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  assert.ok(match, `${file} needs YAML frontmatter`);
  return { header: YAML.parse(match[1]), body: match[2] };
}

describe("Owner-directed agent team configuration", () => {
  test("only the agreed team has active, consistently named profiles", () => {
    const files = fs.readdirSync(agentsDir).filter((name) => name.endsWith(".md"));
    assert.deepEqual(files.sort(), expectedAgents.map((name) => `${name}.agent.md`).sort());
    for (const name of expectedAgents) {
      const { header } = readProfile(path.join(agentsDir, `${name}.agent.md`));
      assert.equal(header.name, name, `profile ID and name must agree for ${name}`);
      for (const handoff of header.handoffs ?? []) {
        assert.ok(expectedAgents.includes(handoff.agent), `${name} points to unknown agent ${handoff.agent}`);
      }
    }
  });

  test("delegated profiles inherit repository instructions and use documented aliases", () => {
    for (const name of expectedAgents) {
      const { header } = readProfile(path.join(agentsDir, `${name}.agent.md`));
      assert.equal(header["include-custom-instructions"], true, `${name} must receive repository instructions`);
      assert.ok(Array.isArray(header.tools) && header.tools.length > 0, `${name} needs an explicit tool list`);
      for (const tool of header.tools) {
        assert.ok(supportedAliases.has(tool) || /^[a-z0-9-]+\/\*$/.test(tool), `${name} has an unsupported tool name: ${tool}`);
      }
      for (const skill of header.skills ?? []) {
        assert.ok(fs.existsSync(path.join(".github/skills", skill, "SKILL.md")), `${name} refers to unavailable project skill ${skill}`);
      }
      for (const server of Object.values(header["mcp-servers"] ?? {})) {
        assert.ok(!(server.command === "npx" && server.args?.includes("-y")), `${name} must not silently install an MCP server`);
      }
    }
  });

  test("agents have tools for their actual work without giving the reviewer edit or shell access", () => {
    const tools = (name) => readProfile(path.join(agentsDir, `${name}.agent.md`)).header.tools;
    assert.ok(tools("planner").includes("execute"), "planner needs to run validation when requested");
    for (const name of ["implementer", "rust-coder"]) {
      assert.ok(tools(name).includes("edit") && tools(name).includes("execute"), `${name} needs edit and build tools`);
    }
    assert.ok(tools("verifier").includes("execute"), "verifier needs to run checks");
    assert.ok(!tools("reviewer").includes("edit") && !tools("reviewer").includes("execute"));
  });

  test("the coordinator does not instruct a paid Jev intake during the pause", () => {
    const { body } = readProfile(path.join(agentsDir, "coordinator.agent.md"));
    assert.match(body, /Jev and automated control-plane enforcement are paused/i);
    assert.doesNotMatch(body, /node\s+src\/cli\.js\s+triage\b/);
  });

  test("the four project skills have usable frontmatter", () => {
    for (const name of ["planning", "implementation", "review", "verification"]) {
      const file = path.join(".github/skills", name, "SKILL.md");
      const { header, body } = readProfile(file);
      assert.equal(header.name, name);
      assert.ok(typeof header.description === "string" && header.description.trim());
      assert.match(body, /Current manual mode/i);
    }
  });

  test("the proposed tool policy does not claim it is enforced", () => {
    const file = ".github/control-plane/policies/tool-access.yaml";
    const text = fs.readFileSync(file, "utf8");
    const policy = YAML.parse(text);
    assert.match(text, /not consumed or enforced/i);
    assert.ok(policy.roles.planner.allowed_tools.includes("execute"));
    assert.ok(policy.roles.verifier.allowed_tools.includes("execute"));
  });
});
