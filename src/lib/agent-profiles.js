import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";

// Agent profiles (`.github/agents/<name>.agent.md`) checked against the tool
// policy (`policies/tool-access.yaml`). This catches drift between what a
// profile lists and what its role was agreed to have. It is a declaration
// check: the agent client, not this code, decides what an agent can do.

const MODEL_ID = /^[a-z0-9][a-z0-9.-]*$/;
// The levels Copilot CLI accepts (`effortLevel`, cli-config-dir reference); a model may support fewer.
export const REASONING_EFFORTS = ["none", "minimal", "low", "medium", "high", "xhigh", "max"];
// GitHub's limit on a custom agent's prompt, the Markdown below the frontmatter.
const MAX_PROMPT_CHARS = 30_000;

/** True when `pattern` names `tool` exactly or is a `server/*` wildcard that covers it. */
export function covers(pattern, tool) {
  return pattern === tool || (pattern.endsWith("/*") && tool.startsWith(pattern.slice(0, -1)));
}

/** Model family: the ID's first dash-separated part (`claude-sonnet-5.5` -> `claude`). */
export function modelFamily(model) {
  return model.split("-")[0];
}

/** The models a profile may run on, in priority order: `models` when it is a list, else `model`. */
export function authoredModels(header) {
  if (Array.isArray(header.models)) return header.models.filter((m) => typeof m === "string");
  return typeof header.model === "string" ? [header.model] : [];
}

function readFrontmatter(file) {
  const text = fs.readFileSync(file, "utf8");
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  return match ? { header: YAML.parse(match[1]) ?? {}, promptChars: text.length - match[0].length } : null;
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
  // Copilot names an agent after its file minus `.agent.md` or `.md`, so both forms are profiles.
  const entries = fs.readdirSync(agentsDir).filter((f) => f.endsWith(".md")).sort()
    .map((f) => ({ name: f.replace(/(\.agent)?\.md$/, ""), file: path.join(agentsDir, f) }));
  const names = entries.map((e) => e.name);

  const profiles = [];
  for (const { name, file } of entries) {
    let parsed;
    try {
      parsed = readFrontmatter(file);
    } catch (err) {
      fail(file, "", `invalid frontmatter: ${err.message}`);
      continue;
    }
    if (!parsed) {
      fail(file, "", "needs YAML frontmatter");
      continue;
    }
    const { header, promptChars } = parsed;
    if (promptChars > MAX_PROMPT_CHARS) fail(file, "", `prompt is ${promptChars} characters; GitHub allows ${MAX_PROMPT_CHARS}`);
    const role = roleOf[name];
    if (!roles[role]) {
      fail(toolAccessFile, `/profiles/${name}`, role ? `role "${role}" is not defined under roles` : `profile "${name}" has no role`);
      continue;
    }
    const allowed = roles[role].allowed_tools ?? [];
    const forbidden = roles[role].forbidden_tools ?? [];
    // Copilot reads `tools` as a list or a comma-separated string, and grants every tool when it is unset.
    const tools = Array.isArray(header.tools)
      ? header.tools.map(String)
      : typeof header.tools === "string"
        ? header.tools.split(",").map((t) => t.trim()).filter(Boolean)
        : null;
    // Unset, null or an empty string may mean every tool; only an explicit [] means none.
    if (!tools || (typeof header.tools === "string" && tools.length === 0)) {
      fail(file, "/tools", "must list its tools; without a list the agent gets every tool");
    }
    for (const tool of tools ?? []) {
      if (!allowed.some((p) => covers(p, tool))) fail(file, "/tools", `"${tool}" is not allowed for role ${role}`);
      // A wildcard such as `server/*` also counts if it would include a forbidden tool.
      if (forbidden.some((f) => covers(f, tool) || covers(tool, f))) fail(file, "/tools", `"${tool}" includes a tool forbidden for role ${role}`);
    }
    // Without a pin the agent runs on whatever model the session uses.
    if (typeof header.model !== "string" || !MODEL_ID.test(header.model)) fail(file, "/model", "must pin one model ID");
    // `models` is the CLI's priority list; a client that reads only `model` must get the same first choice.
    if (header.models !== undefined) {
      const list = header.models;
      if (!Array.isArray(list) || !list.length || list.some((m) => typeof m !== "string" || !MODEL_ID.test(m))) {
        fail(file, "/models", "must be a non-empty list of model IDs");
      } else if (new Set(list).size !== list.length) {
        fail(file, "/models", "lists a model twice");
      } else if (list[0] !== header.model) {
        fail(file, "/models", `must start with the model pin "${header.model}"`);
      }
    }
    // Unset, the agent inherits the session's effort when it runs on the session's model, up to max.
    if (!REASONING_EFFORTS.includes(header.reasoningEffort)) {
      fail(file, "/reasoningEffort", `must be one of ${REASONING_EFFORTS.join(", ")}`);
    }
    profiles.push({ file, name, role, header });
  }
  for (const name of Object.keys(roleOf)) {
    if (!names.includes(name)) fail(toolAccessFile, `/profiles/${name}`, `no profile ${name}.agent.md`);
  }

  // ADR 0003: security-critical review needs a different model family than its author.
  // Every listed model counts: a fallback is a model the agent may run on.
  const models = policy.models ?? {};
  const coders = profiles.filter((p) => (models.coding_roles ?? []).includes(p.role));
  for (const p of profiles.filter((q) => (models.review_roles ?? []).includes(q.role))) {
    // The CLI reference spells it modelPolicy; a probe showed the kebab-case `model-policy` has no effect.
    if (p.header.modelPolicy !== "required") fail(p.file, "/modelPolicy", "review roles must set modelPolicy: required");
    for (const family of new Set(authoredModels(p.header).map(modelFamily))) {
      for (const c of coders.filter((q) => authoredModels(q.header).some((m) => modelFamily(m) === family))) {
        fail(p.file, "/model", `shares model family "${family}" with ${c.name}, a coding agent`);
      }
    }
  }
  return { problems, checked: profiles.length, skipped: false };
}
