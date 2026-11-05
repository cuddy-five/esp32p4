/*
 * Every action and container image a workflow runs is pinned to an immutable
 * digest, so a moved tag cannot change what CI executes. Local actions (./)
 * come from the checked-out commit and need no pin. Files ending in .disabled
 * do not run and are not scanned.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";

const root = fileURLToPath(new URL("../..", import.meta.url));

/** owner/repo[/path]@<40-hex commit>, docker://image[:tag]@sha256:<64-hex>, or ./local */
function isPinned(uses) {
  return uses.startsWith("./") ||
    /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(\/[^@\s]+)?@[0-9a-f]{40}$/.test(uses) ||
    /^docker:\/\/[^@\s]+@sha256:[0-9a-f]{64}$/.test(uses);
}

function runnableFiles() {
  const workflows = path.join(root, ".github/workflows");
  const files = fs.readdirSync(workflows).filter((f) => /\.ya?ml$/.test(f)).map((f) => path.join(workflows, f));
  const actions = path.join(root, ".github/actions");
  for (const dir of fs.readdirSync(actions)) {
    for (const name of ["action.yml", "action.yaml"]) {
      const file = path.join(actions, dir, name);
      if (fs.existsSync(file)) files.push(file);
    }
  }
  return files;
}

/** `uses` of reusable-workflow jobs, job steps and composite-action steps. */
function usesOf(doc) {
  const found = [];
  for (const job of Object.values(doc?.jobs ?? {})) {
    if (job?.uses) found.push(job.uses);
    for (const step of job?.steps ?? []) if (step?.uses) found.push(step.uses);
  }
  for (const step of doc?.runs?.steps ?? []) if (step?.uses) found.push(step.uses);
  return found;
}

test("the pin rule accepts digests and rejects tags and branches", () => {
  assert.ok(isPinned("actions/checkout@34e114876b0b11c390a56381ad16ebd13914f8d5"));
  assert.ok(isPinned("github/codeql-action/init@34e114876b0b11c390a56381ad16ebd13914f8d5"));
  assert.ok(isPinned(`docker://rhysd/actionlint@sha256:${"a".repeat(64)}`));
  assert.ok(isPinned("./.github/actions/validate-contract"));
  for (const bad of ["actions/checkout@v4", "actions/checkout@main", "actions/checkout@34e1148", "docker://rhysd/actionlint:1.7.7", "docker://alpine"]) {
    assert.equal(isPinned(bad), false, bad);
  }
});

test("every action and image the workflows run is pinned to a digest", () => {
  const unpinned = [];
  let count = 0;
  for (const file of runnableFiles()) {
    for (const uses of usesOf(YAML.parse(fs.readFileSync(file, "utf8")))) {
      count += 1;
      if (!isPinned(uses)) unpinned.push(`${path.relative(root, file)}: ${uses}`);
    }
  }
  assert.ok(count >= 10, `found only ${count} uses entries; the scan is broken`);
  assert.deepEqual(unpinned, []);
});
