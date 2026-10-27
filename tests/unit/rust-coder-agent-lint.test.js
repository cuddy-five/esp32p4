import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import yaml from "yaml";

const AGENT_PATH = path.resolve(".github/agents/rust-coder.agent.md");

describe("Rust Coder Agent Specification Integrity & Bug Diagnostics", () => {
  const content = fs.readFileSync(AGENT_PATH, "utf8");

  // Extract YAML frontmatter
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  assert.ok(match, "rust-coder.agent.md must contain valid YAML frontmatter demarcated by ---");

  const [, frontmatterRaw, body] = match;
  let parsedYaml;
  try {
    parsedYaml = yaml.parse(frontmatterRaw);
  } catch (err) {
    assert.fail(`YAML frontmatter failed to parse: ${err.message}`);
  }

  test("Check 1: Frontmatter schema & MCP configuration", () => {
    assert.equal(parsedYaml.name, "rust-coder", "Agent name must be rust-coder");
    assert.equal(parsedYaml.target, "github-copilot", "Target must be github-copilot");
    assert.ok(Array.isArray(parsedYaml.tools), "tools must be an array");

    // Must not have VS Code explicit sub-namespace tool entitlement paths
    for (const tool of parsedYaml.tools) {
      assert.ok(
        !tool.includes("/readFile") && !tool.includes("/runInTerminal"),
        `Tool entitlement '${tool}' should not use VS Code-specific sub-namespaces in PyCharm/Copilot profile`
      );
    }

    // Check MCP servers for placeholder or broken syntax
    if (parsedYaml["mcp-servers"]) {
      const mcpServers = parsedYaml["mcp-servers"];
      for (const [srvName, srvConfig] of Object.entries(mcpServers)) {
        assert.ok(
          srvConfig.type === "stdio" || srvConfig.type === "local",
          `MCP server ${srvName} type must be valid (stdio or local)`
        );
        // Check for placeholder secrets or dummy tokens
        const rawString = JSON.stringify(srvConfig);
        assert.ok(
          !rawString.includes("COPILOT_MCP_ENV_VAR_VALUE") && !rawString.includes("${{ secrets."),
          `MCP server ${srvName} contains unresolved GitHub Actions secret expression in local PyCharm/Copilot configuration: ${rawString}`
        );
      }
    }
  });

  test("Check 2: Portability & Link Integrity (No hardcoded host machine absolute paths)", () => {
    // Links should not be hardcoded to /var/home/cb or /home/cb because that breaks on other developer machines, CI, or PyCharm
    const hostPathRegex = /file:\/\/\/(?:var\/)?home\/[a-zA-Z0-9_-]+\//g;
    const matches = [...content.matchAll(hostPathRegex)];
    assert.equal(
      matches.length,
      0,
      `Found hardcoded machine-local home paths in agent prompt: ${matches.map(m => m[0]).join(", ")}. Use repo-relative links.`
    );
  });

  test("Check 3: #![no_std] Embedded Purity (No unqualified or std types prescribed)", () => {
    // If Cow is recommended in a no_std embedded firmware prompt, it must explicitly specify alloc::borrow::Cow
    if (body.includes("Cow<")) {
      assert.ok(
        body.includes("alloc::borrow::Cow"),
        "Prescribes unqualified Cow<'a, [u8]> in a #![no_std] firmware prompt without specifying alloc::borrow::Cow; will cause agent to emit 'use std::borrow::Cow' which breaks compilation."
      );
    }

    // Must not prescribe std::sync
    assert.ok(
      !body.includes("std::sync"),
      "Must not prescribe std::sync in #![no_std] firmware"
    );
  });

  test("Check 4: Authority & Non-Negotiable Governance Coherence (Approval gates exception)", () => {
    // If Zero-Confirmation Policy is asserted, it MUST explicitly carve out human approval gates from policies/approvals.yaml and escalations
    if (body.includes("ZERO-CONFIRMATION POLICY")) {
      const zeroConfirmIdx = body.indexOf("ZERO-CONFIRMATION POLICY");
      const zeroConfirmSection = body.slice(zeroConfirmIdx, zeroConfirmIdx + 400);
      assert.ok(
        zeroConfirmSection.toLowerCase().includes("approval") && zeroConfirmSection.toLowerCase().includes("gate"),
        "ZERO-CONFIRMATION POLICY must explicitly carve out human approval gates (policies/approvals.yaml) so the agent does not attempt unauthorized actions."
      );
    }
  });

  test("Check 5: Handoff Target Validation against Control Plane Roles", () => {
    // Handoff targets in frontmatter must be valid agents/roles recognized in the control plane
    const recognizedRoles = ["coordinator", "planner", "implementer", "reviewer", "security_auditor", "security-auditor", "verifier", "adversarial"];
    for (const handoff of parsedYaml.handoffs || []) {
      assert.ok(
        recognizedRoles.includes(handoff.agent),
        `Handoff target agent '${handoff.agent}' is not a recognized control plane role`
      );
    }
  });
});
