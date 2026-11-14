import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { buildWalletContext, main, TOPICS } from "../../scripts/wallet-context.js";

const root = fileURLToPath(new URL("../../", import.meta.url));
const script = path.join(root, "scripts/wallet-context.js");

function invoke(args) {
  const out = [];
  const err = [];
  const code = main(args, { stdout: (s) => out.push(s), stderr: (s) => err.push(s) });
  return { code, out: out.join("\n"), err: err.join("\n") };
}

test("wallet context requires one known topic; help does not need a checkout", () => {
  for (const args of [[], ["unknown"], ["../PROJECT.md"], ["signing", "hardware"], ["--root", "/tmp"]]) {
    const result = invoke(args);
    assert.equal(result.code, 1);
    assert.equal(result.out, "");
    assert.match(result.err, /signing, secrets, hardware, interface, integration/);
  }
  for (const flag of ["--help", "-h"]) {
    const result = invoke([flag]);
    assert.equal(result.code, 0);
    assert.match(result.out, /node scripts\/wallet-context\.js <topic>/);
    assert.match(result.out, /does not run checks/);
    assert.equal(result.err, "");
  }
});

test("each topic resolves current repository sources and stays bounded", () => {
  for (const topic of TOPICS) {
    const report = buildWalletContext(topic);
    assert.match(report, /PROJECT\.md/);
    assert.match(report, /docs\/runbooks\/wallet-development\.md/);
    assert.match(report, /docs\/templates\/wallet-task\.md/);
    assert.match(report, /\.review-domains\.json/);
    assert.match(report, /No checks have run; this is not approval or readiness evidence/);
    assert.ok(report.length < 5500, `${topic} must stay a small routing packet`);
  }
});

test("source routing separates signing rules from peripheral work", () => {
  const signing = buildWalletContext("signing");
  assert.match(signing, /references\/fork-rules\.md/);
  assert.match(signing, /references\/bitcoin-standards\.md/);
  assert.match(signing, /scripts\/unified_sighash_check\.py/);
  assert.doesNotMatch(signing, /references\/board-waveshare/);
  assert.match(signing, /signing policy/);

  const hardware = buildWalletContext("hardware");
  assert.match(hardware, /references\/chip-esp32-p4\.md/);
  assert.match(hardware, /references\/board-waveshare/);
  assert.doesNotMatch(hardware, /scripts\/unified_sighash_check\.py/);
  assert.match(hardware, /device measurements/);

  const integration = buildWalletContext("integration");
  assert.match(integration, /npm test/);
  assert.match(integration, /npm run validate:examples/);
  assert.match(integration, /node src\/cli\.js policy check/);
});

test("CLI output is deterministic and independent of the caller's directory", () => {
  const run = (cwd) => spawnSync(process.execPath, [script, "signing"], { cwd, encoding: "utf8" });
  const here = run(root);
  const elsewhere = run(os.tmpdir());
  assert.equal(here.status, 0, here.stderr);
  assert.equal(elsewhere.status, 0, elsewhere.stderr);
  assert.equal(elsewhere.stdout, here.stdout);
  assert.equal(elsewhere.stderr, "");
});

test("missing, non-file and symlinked sources fail without reporting a usable packet", (t) => {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "wallet-context-"));
  t.after(() => fs.rmSync(scratch, { recursive: true, force: true }));
  const checkout = path.join(scratch, "checkout");
  fs.mkdirSync(checkout);
  assert.throws(() => buildWalletContext("hardware", checkout), /required source unavailable: PROJECT\.md/);

  fs.mkdirSync(path.join(checkout, "PROJECT.md"));
  assert.throws(() => buildWalletContext("hardware", checkout), /source is not a regular file: PROJECT\.md/);
  fs.rmdirSync(path.join(checkout, "PROJECT.md"));

  const outside = path.join(scratch, "outside.md");
  fs.writeFileSync(outside, "must not be read or included");
  fs.symlinkSync(outside, path.join(checkout, "PROJECT.md"));
  assert.throws(() => buildWalletContext("hardware", checkout), /symlinked source refused: PROJECT\.md/);
  fs.unlinkSync(path.join(checkout, "PROJECT.md"));
  fs.writeFileSync(path.join(checkout, "PROJECT.md"), "project");
  fs.symlinkSync(scratch, path.join(checkout, "docs"));
  assert.throws(() => buildWalletContext("hardware", checkout), /symlinked source refused: docs\/runbooks\/wallet-development\.md/);
});
