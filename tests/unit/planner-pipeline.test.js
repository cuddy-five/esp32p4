import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { main, EXIT } from "../../src/cli.js";

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
