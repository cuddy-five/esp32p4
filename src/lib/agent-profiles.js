import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";

// Agent profiles (`.github/agents/<name>.agent.md`) checked against the tool
// policy (`policies/tool-access.yaml`). This catches drift between what a
// profile lists and what its role was agreed to have. It is a declaration
// check: the agent client, not this code, decides what an agent can do.

const MODEL_ID = /^[a-z0-9][a-z0-9.-]*$/;

/** True when `pattern` names `tool` exactly or is a `server/*` wildcard that covers it. */
export function covers(pattern, tool) {
  return pattern === tool || (pattern.endsWith("/*") && tool.startsWith(pattern.slice(0, -1)));
}

/** Model family: the ID's first dash-separated part (`claude-sonnet-5.5` -> `claude`). */
export function modelFamily(model) {
  return model.split("-")[0];
}

function readFrontmatter(file) {
  const match = fs.readFileSync(file, "utf8").match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  return match ? (YAML.parse(match[1]) ?? {}) : null;
}

/**
 * @param {{ agentsDir: string, toolAccessFile: string }} opts
 * @returns {{ problems: {file: string, path: string, message: string}[], checked: number, skipped: boolean }}
 */
export function checkAgentProfiles({ agentsDir, toolAccessFile }) {
  const problems = [];
  const fail = (file, at, message) => problems.push({ file, path: at, message });
  if (!fs.existsSync(agentsDir) || !fs.existsSync(toolAccessFile)) return { problems, checked: 0, skipped: true };

  let policy;
  try {
    policy = YAML.parse(fs.readFileSync(toolAccessFile, "utf8")) ?? {};
  } catch (err) {
    fail(toolAccessFile, "", `invalid YAML: ${err.message}`);
    return { problems, checked: 0, skipped: false };
  }
  const roles = policy.roles ?? {};
  const roleOf = policy.profiles ?? {};
  const names = fs.readdirSync(agentsDir).filter((f) => f.endsWith(".agent.md")).map((f) => f.slice(0, -".agent.md".length)).sort();

  const profiles = [];
  for (const name of names) {
    const file = path.join(agentsDir, `${name}.agent.md`);
    let header;
    try {
      header = readFrontmatter(file);
    } catch (err) {
      fail(file, "", `invalid frontmatter: ${err.message}`);
      continue;
    }
    if (!header) {
      fail(file, "", "needs YAML frontmatter");
      continue;
    }
    const role = roleOf[name];
    if (!roles[role]) {
      fail(toolAccessFile, `/profiles/${name}`, role ? `role "${role}" is not defined under roles` : `profile "${name}" has no role`);
      continue;
    }
    const allowed = roles[role].allowed_tools ?? [];
    const forbidden = roles[role].forbidden_tools ?? [];
    // Copilot reads `tools` as a list or a comma-separated string, and grants every tool when it is unset.
    const tools = Array.isArray(header.tools)
      ? header.tools
      : typeof header.tools === "string"
        ? header.tools.split(",").map((t) => t.trim()).filter(Boolean)
        : null;
    if (!tools) fail(file, "/tools", "must list its tools; without a list the agent gets every tool");
    for (const tool of tools ?? []) {
      if (!allowed.some((p) => covers(p, tool))) fail(file, "/tools", `"${tool}" is not allowed for role ${role}`);
      // A wildcard such as `server/*` also counts if it would include a forbidden tool.
      if (forbidden.some((f) => covers(f, tool) || covers(tool, f))) fail(file, "/tools", `"${tool}" includes a tool forbidden for role ${role}`);
    }
    // Without a pin the agent runs on whatever model the session uses.
    if (typeof header.model !== "string" || !MODEL_ID.test(header.model)) fail(file, "/model", "must pin one model ID");
    profiles.push({ file, name, role, header });
  }
  for (const name of Object.keys(roleOf)) {
    if (!names.includes(name)) fail(toolAccessFile, `/profiles/${name}`, `no profile ${name}.agent.md`);
  }

  // ADR 0003: security-critical review needs a different model family than its author.
  const models = policy.models ?? {};
  const pinned = (p) => typeof p.header.model === "string";
  const coders = profiles.filter((p) => (models.coding_roles ?? []).includes(p.role) && pinned(p));
  for (const p of profiles.filter((q) => (models.review_roles ?? []).includes(q.role))) {
    // The CLI reference spells it modelPolicy; a probe showed the kebab-case `model-policy` has no effect.
    if (p.header.modelPolicy !== "required") fail(p.file, "/modelPolicy", "review roles must set modelPolicy: required");
    if (!pinned(p)) continue;
    for (const c of coders) {
      if (modelFamily(c.header.model) === modelFamily(p.header.model)) {
        fail(p.file, "/model", `shares model family "${modelFamily(p.header.model)}" with ${c.name}, a coding agent`);
      }
    }
  }
  return { problems, checked: profiles.length, skipped: false };
}
