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
const CODER = "model: gpt-6-luna\ntools: [read, edit]";
const CHECKER = "model: kimi-k3\nmodel-policy: required\ntools: [read]";

/** Problems reported for a temporary set of profiles; `null` leaves a profile out. */
function problems({ coder = CODER, checker = CHECKER, extra = {}, policy = POLICY } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-profiles-"));
  try {
    const agentsDir = path.join(dir, "agents");
    fs.mkdirSync(agentsDir);
    for (const [name, fields] of Object.entries({ coder, checker, ...extra })) {
      if (fields !== null) fs.writeFileSync(path.join(agentsDir, `${name}.agent.md`), `---\n${fields}\n---\n\nBody.\n`);
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
    const out = problems({ checker: "model: kimi-k3\nmodel-policy: required\ntools: [read, basic-memory/*]" });
    assert.match(out, /"basic-memory\/\*" includes a tool forbidden for role reviewer/);
  });

  test("a profile without a model pin fails", () => {
    assert.match(problems({ coder: "tools: [read]" }), /must pin one model ID/);
  });

  test("a review role without model-policy fails", () => {
    assert.match(problems({ checker: "model: kimi-k3\ntools: [read]" }), /review roles must set model-policy: required/);
  });

  test("a review role on a coding agent's model family fails", () => {
    const out = problems({ checker: "model: gpt-5.6-luna\nmodel-policy: required\ntools: [read]" });
    assert.match(out, /shares model family "gpt" with coder, a coding agent/);
  });

  test("profiles and the role map must match both ways", () => {
    assert.match(problems({ extra: { stray: CODER } }), /profile "stray" has no role/);
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
