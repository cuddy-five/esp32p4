import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const scanner = path.resolve(".github/skills/acquire-codebase-knowledge/scripts/scan.py");

function fixture(run) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "codebase-scan-"));
  try { run(dir); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

function scan(cwd, ...args) {
  return spawnSync("python3", [scanner, ...args], { cwd, encoding: "utf8", timeout: 15000 });
}

test("codebase scan keeps ordinary evidence and excludes protected paths and symlinks", () => {
  fixture((dir) => {
    fs.writeFileSync(path.join(dir, "package.json"), '{"name":"scan-fixture"}');
    fs.writeFileSync(path.join(dir, "app.js"), "// TODO normal-evidence\n");
    for (const name of [".env.example", "access-token.json", "credentials.js", "private.pem", "wallet.dat"]) {
      fs.writeFileSync(path.join(dir, name), "// TODO EXCLUDED_SENTINEL\n");
    }
    fs.mkdirSync(path.join(dir, ".ssh"));
    fs.writeFileSync(path.join(dir, ".ssh", "config.json"), "EXCLUDED_SENTINEL");
    fs.symlinkSync("app.js", path.join(dir, "linked.js"));
    fs.symlinkSync(".", path.join(dir, "cycle"));
    fs.mkdirSync(path.join(dir, ".github"));
    fs.symlinkSync("..", path.join(dir, ".github", "workflows"));
    fs.writeFileSync(path.join(dir, "pipeline.yml"), "# synthetic workflow\n");
    const result = scan(dir);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /scan-fixture/);
    assert.match(result.stdout, /app.js:1:.*normal-evidence/);
    assert.doesNotMatch(result.stdout, /EXCLUDED_SENTINEL|linked\.js|cycle|\.env\.example|access-token|credentials\.js|private\.pem|wallet\.dat/);
    assert.doesNotMatch(result.stdout, /CI\/CD: GitHub Actions/,
      "a symlinked workflow directory must not be traversed for detection");
    assert.equal(fs.existsSync(path.join(dir, "docs")), false, "stdout scan must not save reports");
  });
});

test("codebase scan rejects protected, external and symlink output paths", () => {
  fixture((dir) => {
    fs.mkdirSync(path.join(dir, "reports"));
    fs.symlinkSync("reports", path.join(dir, "linked-reports"));
    for (const output of [".env.example", "../outside-scan.txt", "linked-reports/scan.txt"]) {
      const result = scan(dir, "--output", output);
      assert.equal(result.status, 1, result.stderr);
      assert.match(result.stderr, /permitted path/);
    }
    assert.deepEqual(fs.readdirSync(path.join(dir, "reports")), []);
    const result = scan(dir, "--output", "reports/scan.txt");
    assert.equal(result.status, 0, result.stderr);
    assert.match(fs.readFileSync(path.join(dir, "reports/scan.txt"), "utf8"), /SCAN COMPLETE/);
  });
});
