import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { main, EXIT } from "../../src/cli.js";

test("planner can resolve its knowledge skill and every bundled asset", () => {
  const profile = fs.readFileSync(".github/agents/planner.agent.md", "utf8");
  const header = YAML.parse(profile.match(/^---\n([\s\S]*?)\n---/)[1]);
  assert.ok(header.skills.includes("acquire-codebase-knowledge"));
  const root = ".github/skills/acquire-codebase-knowledge";
  const entry = fs.readFileSync(path.join(root, "SKILL.md"), "utf8");
  const skill = YAML.parse(entry.match(/^---\n([\s\S]*?)\n---/)[1]);
  assert.equal(skill.name, "acquire-codebase-knowledge");
  const assets = [
    ...["STACK", "STRUCTURE", "ARCHITECTURE", "CONVENTIONS", "INTEGRATIONS", "TESTING", "CONCERNS"]
      .map((name) => `assets/templates/${name}.md`),
    "references/inquiry-checkpoints.md", "references/stack-detection.md", "scripts/scan.py",
  ];
  assert.equal(assets.length, 10);
  for (const asset of assets) {
    assert.ok(fs.statSync(path.join(root, asset)).size > 0, `missing asset ${asset}`);
    assert.ok(entry.includes(`](${asset})`), `asset not reachable from skill: ${asset}`);
  }
});

test("planner policy command preserves tag-triggered approval stages", async () => {
  const reference = fs.readFileSync(
    ".github/skills/planning/references/formal-plan-contracts.md", "utf8",
  );
  const command = reference.match(/`node src\/cli\.js (policy stages [^`]+)`/)?.[1];
  assert.ok(command, "formal planning needs a policy command");

  // Exercise the documented command, so dropping tags from the guidance fails.
  for (const tags of [[], ["auth"], ["ci_cd", "pii"]]) {
    const args = command
      .replace("<task.risk.level>", "low")
      .replace("[--tag <tag>]...", tags.map((tag) => `--tag ${tag}`).join(" "))
      .replace("--path <file>...", "--path src/login.js")
      .trim().split(/\s+/);
    const out = [];
    const err = [];
    const code = await main([...args, "--format", "json"], {
      stdout: (line) => out.push(line), stderr: (line) => err.push(line), env: {},
    });
    assert.equal(code, EXIT.OK, err.join("\n"));
    assert.deepEqual(JSON.parse(out.join("\n")).stages,
      tags.length ? ["plan", "merge"] : ["merge"],
      `approval stages for tags ${JSON.stringify(tags)}`);
  }
});
