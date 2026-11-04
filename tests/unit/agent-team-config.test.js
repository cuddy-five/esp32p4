import { describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";

const agentsDir = ".github/agents";
const skillsDir = ".github/skills";
const skillDirs = fs.readdirSync(skillsDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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

  // Model pins, modelPolicy and review-family separation are checked by
  // `control-plane policy check` (src/lib/agent-profiles.js) against tool-access.yaml.
  test("profile models match the registry for registered roles", () => {
    const registered = new Map(JSON.parse(fs.readFileSync(".agents.registry.json", "utf8")).agents
      .map((agent) => [agent.id.replaceAll("_", "-"), agent.model]));
    for (const name of expectedAgents) {
      const { model } = readProfile(path.join(agentsDir, `${name}.agent.md`)).header;
      if (registered.has(name)) assert.equal(model, registered.get(name), `${name} profile and registry models differ`);
    }
  });

  test("every project skill has frontmatter Copilot accepts and pre-approves no tools", () => {
    assert.ok(skillDirs.length > 0, "expected project skills");
    for (const dir of skillDirs) {
      const { header } = readProfile(path.join(skillsDir, dir, "SKILL.md"));
      assert.equal(header.name, dir, `${dir}: name must match its folder`);
      assert.match(header.name, /^[a-z0-9][a-z0-9-]{0,63}$/, `${dir}: name must be lowercase with hyphens, at most 64 characters`);
      assert.ok(typeof header.description === "string" && header.description.trim() && header.description.length <= 1024,
        `${dir}: description must be 1 to 1024 characters`);
      assert.ok(!("allowed-tools" in header), `${dir}: allowed-tools pre-approves tools; remove it`);
    }
  });

  test("adapted skills keep their source, license text and a matching license field", () => {
    for (const dir of skillDirs) {
      const folder = path.join(skillsDir, dir);
      const { header } = readProfile(path.join(folder, "SKILL.md"));
      const files = fs.readdirSync(folder);
      const notice = files.includes("NOTICE.md") ? fs.readFileSync(path.join(folder, "NOTICE.md"), "utf8") : null;
      const licenseFile = files.find((file) => /^LICENSE(\.txt)?$/.test(file));
      if (header.license !== undefined || licenseFile) {
        assert.ok(notice, `${dir}: third-party skill needs NOTICE.md`);
        assert.ok(licenseFile, `${dir}: third-party skill needs the upstream license text`);
        assert.equal(typeof header.license, "string", `${dir}: SKILL.md needs a license field`);
        assert.match(notice, new RegExp(`^License: ${escapeRegExp(header.license)}\\b`, "m"),
          `${dir}: the NOTICE.md License line must name ${header.license}`);
      }
      if (notice) {
        assert.match(notice, /^Source: \S/m, `${dir}: NOTICE.md needs a Source line`);
        assert.match(notice, /^License: \S/m, `${dir}: NOTICE.md needs a License line`);
      }
    }
  });

  test("profiles preload one to three real skills and name their optional skills", () => {
    for (const name of expectedAgents) {
      const { header, body } = readProfile(path.join(agentsDir, `${name}.agent.md`));
      const preloaded = header.skills ?? [];
      assert.ok(Array.isArray(preloaded) && preloaded.length >= 1 && preloaded.length <= 3,
        `${name} must preload one to three skills; every preloaded skill costs context on every run`);
      const line = body.split("\n").find((text) => text.startsWith("**Skills:**"));
      assert.ok(line, `${name} needs a **Skills:** line naming its optional skills`);
      const named = [...line.matchAll(/`([a-z0-9][a-z0-9-]*)`/g)].map((match) => match[1]);
      for (const skill of new Set([...preloaded, ...named])) {
        assert.ok(fs.existsSync(path.join(skillsDir, skill, "SKILL.md")), `${name} names missing skill ${skill}`);
      }
      for (const skill of preloaded) {
        assert.ok(named.includes(skill), `${name}: preloaded skill ${skill} must appear in its Skills line`);
      }
    }
  });

  test("only the coordinator writes Basic Memory, and nobody can delete, move or manage projects", () => {
    const writeTools = ["basic-memory/write_note", "basic-memory/edit_note"];
    const neverTools = ["basic-memory/*", "basic-memory/delete_note", "basic-memory/move_note",
      "basic-memory/create_memory_project", "basic-memory/delete_project"];
    for (const name of expectedAgents) {
      const { tools } = readProfile(path.join(agentsDir, `${name}.agent.md`)).header;
      for (const tool of neverTools) assert.ok(!tools.includes(tool), `${name} must not have ${tool}`);
      for (const tool of writeTools) {
        assert.equal(tools.includes(tool), name === "coordinator",
          `${name} ${name === "coordinator" ? "needs" : "must not have"} ${tool}`);
      }
    }
    const coordinator = readProfile(path.join(agentsDir, "coordinator.agent.md")).header.tools;
    assert.ok(coordinator.includes("basic-memory/search_notes") && coordinator.includes("basic-memory/read_note"),
      "the coordinator must be able to search and read before it writes");
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

  test("NotebookLM access is read-only and limited to the planner, rust-coder and security-auditor", () => {
    const readTools = new Set(["notebook_list", "notebook_get", "notebook_describe", "source_describe",
      "source_get_content", "notebook_query", "notebook_query_start", "notebook_query_status", "cross_notebook_query"]);
    const readers = new Set(["planner", "rust-coder", "security-auditor"]);
    for (const name of expectedAgents) {
      const { header, body } = readProfile(path.join(agentsDir, `${name}.agent.md`));
      const notebook = header.tools.filter((tool) => tool.startsWith("notebooklm/"));
      for (const tool of notebook) {
        assert.ok(readTools.has(tool.slice("notebooklm/".length)), `${name} has a NotebookLM tool that is not read-only: ${tool}`);
      }
      assert.equal(notebook.length > 0, readers.has(name), `${name} ${readers.has(name) ? "needs" : "must not have"} NotebookLM tools`);
      if (readers.has(name)) {
        assert.match(body, /\*\*NotebookLM\*\*/, `${name} must say which notebooks it may read`);
        assert.match(body, /secondary source/, `${name} must treat notebook answers as unverified`);
      }
    }
  });

  test("agents without an edit tool are told never to use lsp rename", () => {
    for (const name of expectedAgents) {
      const { header, body } = readProfile(path.join(agentsDir, `${name}.agent.md`));
      if (!header.tools.includes("lsp") || name === "rust-coder") continue;
      assert.match(body, /Never call its `rename` operation/, `${name} lists lsp and must forbid rename`);
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
    assert.match(body, /Repository protections are required/i);
    assert.match(body, /verify live settings separately/i);
    assert.match(body, /Automatic worker dispatch and approval routing remain deferred/i);
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
