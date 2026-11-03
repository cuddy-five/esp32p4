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
const supportedAliases = new Set(["read", "search", "edit", "execute", "web", "agent", "todo", "lsp"]);

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
        assert.ok(supportedAliases.has(tool) || /^[a-z0-9-]+\/(\*|[a-z0-9_]+)$/.test(tool), `${name} has an unsupported tool name: ${tool}`);
      }
      for (const skill of header.skills ?? []) {
        assert.ok(fs.existsSync(path.join(".github/skills", skill, "SKILL.md")), `${name} refers to unavailable project skill ${skill}`);
      }
      for (const server of Object.values(header["mcp-servers"] ?? {})) {
        assert.ok(!(server.command === "npx" && server.args?.includes("-y")), `${name} must not silently install an MCP server`);
      }
    }
  });

  test("agents have tools for their actual work with reviewer shell inspection but no edit or remote mutation tools", () => {
    const tools = (name) => readProfile(path.join(agentsDir, `${name}.agent.md`)).header.tools;
    assert.ok(tools("planner").includes("execute"), "planner needs to run validation when requested");
    for (const name of ["implementer", "rust-coder"]) {
      assert.ok(tools(name).includes("edit") && tools(name).includes("execute"), `${name} needs edit and build tools`);
    }
    assert.ok(tools("verifier").includes("execute"), "verifier needs to run checks");
    assert.ok(tools("reviewer").includes("execute"));
    assert.ok(!tools("reviewer").includes("edit"));
    assert.ok(!tools("reviewer").includes("github/*"));
  });

  test("the planner reads Basic Memory but cannot write it", () => {
    const tools = readProfile(path.join(agentsDir, "planner.agent.md")).header.tools;
    const memory = tools.filter((tool) => tool.startsWith("basic-memory/"));
    assert.ok(memory.includes("basic-memory/search_notes") && memory.includes("basic-memory/read_note"));
    for (const forbidden of ["basic-memory/*", "basic-memory/write_note", "basic-memory/edit_note",
      "basic-memory/delete_note", "basic-memory/move_note", "basic-memory/create_memory_project", "basic-memory/delete_project"]) {
      assert.ok(!memory.includes(forbidden), `planner must not have ${forbidden}`);
    }
  });

  test("no proposed tool policy role forbids a tool it also allows", () => {
    const policy = YAML.parse(fs.readFileSync(".github/control-plane/policies/tool-access.yaml", "utf8"));
    const covers = (pattern, tool) => pattern === tool || (pattern.endsWith("/*") && tool.startsWith(pattern.slice(0, -1)));
    for (const [role, entry] of Object.entries(policy.roles)) {
      for (const forbidden of entry.forbidden_tools ?? []) {
        const clash = (entry.allowed_tools ?? []).find((tool) => covers(forbidden, tool));
        assert.equal(clash, undefined, `${role} forbids ${forbidden} but allows ${clash}`);
      }
    }
  });

  test("Rust code intelligence comes from a cautious project language server", () => {
    const lsp = JSON.parse(fs.readFileSync(".github/lsp.json", "utf8")).lspServers["rust-analyzer"];
    assert.equal(lsp.command, "rust-analyzer");
    assert.equal(lsp.fileExtensions[".rs"], "rust");
    const options = lsp.initializationOptions;
    assert.equal(options.cargo.buildScripts.enable, false, "opening a session must not run dependency build scripts");
    assert.equal(options.procMacro.enable, false, "opening a session must not run proc macros");
    assert.equal(options.checkOnSave, false, "cargo runs belong to an approved execute call");
    for (const name of expectedAgents) {
      const { header } = readProfile(path.join(agentsDir, `${name}.agent.md`));
      assert.ok(!header.tools.some((tool) => tool.startsWith("rust-mcp/")), `${name} lists the retired rust-mcp server`);
    }
  });

  test("the coordinator preserves manual mode without invoking intake", () => {
    const { body } = readProfile(path.join(agentsDir, "coordinator.agent.md"));
    assert.match(body, /Automated control-plane enforcement is paused/i);
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
