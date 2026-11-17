import { describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { checkAgentProfiles, covers } from "../../src/lib/agent-profiles.js";

const POLICY = `version: 1
profiles:
  coder: implementer
  checker: reviewer
models:
  coding_roles: [implementer]
  review_roles: [reviewer]
roles:
  implementer:
    allowed_tools: [read, edit, github/*]
    forbidden_tools: []
  reviewer:
    allowed_tools: [read, basic-memory/search_notes]
    forbidden_tools: [edit, basic-memory/write_note]
`;
const CODER = "model: gpt-6-luna\nreasoningEffort: high\ntools: [read, edit]";
const CHECKER = "model: kimi-k3\nmodelPolicy: required\nreasoningEffort: medium\ntools: [read]";

/** Problems reported for a temporary set of profiles; `null` leaves a profile out. */
function problems({ coder = CODER, checker = CHECKER, extra = {}, policy = POLICY } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-profiles-"));
  try {
    const agentsDir = path.join(dir, "agents");
    fs.mkdirSync(agentsDir);
    for (const [name, fields] of Object.entries({ coder, checker, ...extra })) {
      if (fields !== null) fs.writeFileSync(path.join(agentsDir, name.endsWith(".md") ? name : `${name}.agent.md`), `---\n${fields}\n---\n\nBody.\n`);
    }
    const toolAccessFile = path.join(dir, "tool-access.yaml");
    fs.writeFileSync(toolAccessFile, policy);
    return checkAgentProfiles({ agentsDir, toolAccessFile }).problems.map((p) => p.message).join("\n");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

describe("agent profiles against the tool policy", () => {
  test("the repository's own profiles pass", () => {
    const result = checkAgentProfiles({
      agentsDir: ".github/agents",
      toolAccessFile: ".github/control-plane/policies/tool-access.yaml",
    });
    assert.deepEqual(result.problems, []);
    assert.equal(result.checked, 8);
  });

  test("a profile inside its role passes", () => {
    assert.equal(problems(), "");
  });

  test("a tool outside the role fails", () => {
    assert.match(problems({ coder: "model: gpt-6-luna\ntools: [read, web]" }), /"web" is not allowed for role implementer/);
  });

  test("a wildcard that would include a forbidden tool fails", () => {
    const out = problems({ checker: "model: kimi-k3\nmodelPolicy: required\ntools: [read, basic-memory/*]" });
    assert.match(out, /"basic-memory\/\*" includes a tool forbidden for role reviewer/);
  });

  test("a missing tools list fails, and a comma-separated list is checked", () => {
    assert.match(problems({ checker: "model: kimi-k3\nmodelPolicy: required" }), /must list its tools/);
    assert.match(problems({ checker: "model: kimi-k3\nmodelPolicy: required\ntools: 'read, edit'" }), /"edit" is not allowed for role reviewer/);
    assert.match(problems({ checker: "model: kimi-k3\nmodelPolicy: required\ntools: ''" }), /must list its tools/);
    assert.equal(problems({ checker: "model: kimi-k3\nmodelPolicy: required\nreasoningEffort: low\ntools: []" }), "");
  });

  test("a profile needs a reasoning effort the CLI accepts", () => {
    assert.match(problems({ coder: "model: gpt-6-luna\ntools: [read]" }), /must be one of none, minimal, low, medium, high, xhigh, max/);
    assert.match(problems({ coder: "model: gpt-6-luna\nreasoningEffort: extreme\ntools: [read]" }), /reasoningEffort|must be one of/);
  });

  test("a models list holds model IDs, once each, starting with the pin", () => {
    const coder = (models) => `model: gpt-6-luna\nmodels: ${models}\nreasoningEffort: high\ntools: [read]`;
    assert.equal(problems({ coder: coder("[gpt-6-luna, gpt-5.6-luna]") }), "");
    assert.match(problems({ coder: coder("[gpt-5.6-luna, gpt-6-luna]") }), /must start with the model pin "gpt-6-luna"/);
    assert.match(problems({ coder: coder("[gpt-6-luna, gpt-6-luna]") }), /lists a model twice/);
    assert.match(problems({ coder: coder("gpt-6-luna") }), /must be a non-empty list of model IDs/);
    assert.match(problems({ coder: coder("[]") }), /must be a non-empty list of model IDs/);
  });

  test("a fallback model counts for review-family separation, on either side", () => {
    const checker = "model: kimi-k3\nmodels: [kimi-k3, gpt-5.6-luna]\nmodelPolicy: required\nreasoningEffort: medium\ntools: [read]";
    assert.match(problems({ checker }), /shares model family "gpt" with coder, a coding agent/);
    const coder = "model: gpt-6-luna\nmodels: [gpt-6-luna, kimi-k3]\nreasoningEffort: high\ntools: [read]";
    assert.match(problems({ coder }), /shares model family "kimi" with coder, a coding agent/);
  });

  test("a prompt over GitHub's 30,000-character limit fails", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-profiles-"));
    try {
      const agentsDir = path.join(dir, "agents");
      fs.mkdirSync(agentsDir);
      fs.writeFileSync(path.join(agentsDir, "coder.agent.md"), `---\n${CODER}\n---\n${"x".repeat(30_001)}`);
      fs.writeFileSync(path.join(agentsDir, "checker.agent.md"), `---\n${CHECKER}\n---\n${"x".repeat(30_000)}`);
      const toolAccessFile = path.join(dir, "tool-access.yaml");
      fs.writeFileSync(toolAccessFile, POLICY);
      const found = checkAgentProfiles({ agentsDir, toolAccessFile }).problems;
      assert.deepEqual(found.map((p) => [path.basename(p.file), p.message]), [["coder.agent.md", "prompt is 30001 characters; GitHub allows 30000"]]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("a profile without a model pin fails", () => {
    assert.match(problems({ coder: "tools: [read]" }), /must pin one model ID/);
  });

  test("a review role without modelPolicy fails, including the kebab-case spelling", () => {
    assert.match(problems({ checker: "model: kimi-k3\ntools: [read]" }), /review roles must set modelPolicy: required/);
    assert.match(problems({ checker: "model: kimi-k3\nmodel-policy: required\ntools: [read]" }), /review roles must set modelPolicy: required/);
  });

  test("a review role on a coding agent's model family fails", () => {
    const out = problems({ checker: "model: gpt-5.6-luna\nmodelPolicy: required\ntools: [read]" });
    assert.match(out, /shares model family "gpt" with coder, a coding agent/);
  });

  test("profiles and the role map must match both ways", () => {
    assert.match(problems({ extra: { stray: CODER } }), /profile "stray" has no role/);
    assert.match(problems({ extra: { "plain.md": CODER } }), /profile "plain" has no role/);
    assert.match(problems({ checker: null }), /no profile checker\.agent\.md/);
  });

  test("the check is skipped where profiles or the policy are absent", () => {
    const result = checkAgentProfiles({ agentsDir: "/nonexistent-agents", toolAccessFile: "/nonexistent.yaml" });
    assert.equal(result.skipped, true);
    assert.deepEqual(result.problems, []);
  });

  test("covers matches exact names and server wildcards only", () => {
    assert.ok(covers("github/*", "github/get_file_contents"));
    assert.ok(covers("read", "read"));
    assert.ok(!covers("github/get_file_contents", "github/*"));
    assert.ok(!covers("git*", "github"));
  });
});
