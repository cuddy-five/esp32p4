import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { EXIT, main } from "../../src/cli.js";
import { planAll, applyAll, readDesiredFile, selectResources, summarize } from "../../src/lib/settings/index.js";
import { formatPlanMarkdown, formatPlanText, writeStepSummary } from "../../src/lib/report.js";
import { CONTRACTS_DIR, REPO_ROOT } from "../../src/lib/paths.js";
import { fakeClient } from "../helpers/fake-github.js";

const EXAMPLES = path.join(CONTRACTS_DIR, "examples");
const CLI = path.join(REPO_ROOT, "src", "cli.js");

function capture() {
  const out = [];
  const err = [];
  return { out, err, io: { stdout: (s) => out.push(s), stderr: (s) => err.push(s), env: {} } };
}

function tmpSettings(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cp-settings-"));
  for (const [name, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(dir, name), typeof content === "string" ? content : JSON.stringify(content));
  }
  return dir;
}

describe("cli validate", () => {
  test("returns 0 and lists every example as ok", async () => {
    const { out, io } = capture();
    const files = fs.readdirSync(EXAMPLES).map((f) => path.join(EXAMPLES, f));
    const code = await main(["validate", ...files], io);
    assert.equal(code, EXIT.OK);
    assert.match(out.at(-1), /7\/7 documents valid/);
  });

  test("returns 2 for invalid documents and emits annotations when asked", async () => {
    const file = path.join(os.tmpdir(), `cp-cli-bad-${process.pid}.json`);
    fs.writeFileSync(file, JSON.stringify({ contract: "task", id: "abcd" }));
    try {
      const { out, io } = capture();
      const code = await main(["validate", file, "--annotations"], io);
      assert.equal(code, EXIT.FAILED);
      assert.ok(out.some((l) => l.startsWith("FAIL")));
      assert.ok(out.some((l) => l.startsWith(`::error file=${file}::`)));
    } finally {
      fs.unlinkSync(file);
    }
  });

  test("json format emits a machine-readable report", async () => {
    const { out, io } = capture();
    const code = await main(["validate", path.join(EXAMPLES, "task.example.json"), "--format", "json"], io);
    assert.equal(code, EXIT.OK);
    const report = JSON.parse(out.join("\n"));
    assert.equal(report.ok, true);
    assert.equal(report.results[0].kind, "task");
  });

  test("requires at least one file", async () => {
    const { err, io } = capture();
    assert.equal(await main(["validate"], io), EXIT.ERROR);
    assert.match(err[0], /at least one file/);
  });

  test("runs as an executable with the right exit code", () => {
    const stdout = execFileSync(process.execPath, [CLI, "schema", "list"], { encoding: "utf8" });
    assert.equal(stdout.trim().split("\n").length, 7);
  });
});

describe("cli schema", () => {
  test("show prints the schema for a kind", async () => {
    const { out, io } = capture();
    assert.equal(await main(["schema", "show", "task"], io), EXIT.OK);
    assert.equal(JSON.parse(out[0]).title, "Task");
  });
  test("rejects unknown subcommands and missing kinds", async () => {
    const a = capture();
    assert.equal(await main(["schema", "nope"], a.io), EXIT.ERROR);
    const b = capture();
    assert.equal(await main(["schema", "show"], b.io), EXIT.ERROR);
  });
});

describe("cli top level", () => {
  test("prints usage with no command", async () => {
    const { out, io } = capture();
    assert.equal(await main([], io), EXIT.OK);
    assert.match(out[0], /control-plane <command>/);
  });
  test("unknown command is an error", async () => {
    const { err, io } = capture();
    assert.equal(await main(["frobnicate"], io), EXIT.ERROR);
    assert.match(err[0], /unknown command/);
  });
});

describe("cli evidence", () => {

  test("evidence command returns 0 when in scope and 2 when out of scope", async () => {
    const taskPath = path.join(EXAMPLES, "task.example.json");
    const sha = "0123456789abcdef0123456789abcdef01234567";

    const okRun = capture();
    assert.equal(
      await main(["evidence", "--task", taskPath, "--sha", sha, "--path", "src/cli.js"], okRun.io),
      EXIT.OK,
    );

    const badRun = capture();
    assert.equal(
      await main(["evidence", "--task", taskPath, "--sha", sha, "--path", ".github/workflows/ci.yml"], badRun.io),
      EXIT.FAILED,
    );

    const missingTask = capture();
    assert.equal(
      await main(["evidence", "--task", "nonexistent-task.json", "--sha", sha], missingTask.io),
      EXIT.ERROR,
    );
    assert.match(missingTask.err[0], /evidence: cannot read task contract/);
  });
});

describe("settings orchestration", () => {
  const LABELS_FILE = { version: 1, labels: [{ name: "a", color: "000000" }] };
  const RULESETS_FILE = {
    version: 1,
    rulesets: [{ name: "p", target: "branch", enforcement: "active", rules: [{ type: "deletion" }] }],
  };

  test("selectResources validates names and preserves canonical order", () => {
    assert.deepEqual(selectResources(undefined), ["labels", "rulesets"]);
    assert.deepEqual(selectResources(["rulesets", "labels"]), ["labels", "rulesets"]);
    assert.throws(() => selectResources(["nope"]), /unknown settings resource/);
  });

  test("readDesiredFile returns null for absent or empty files and throws on bad JSON", () => {
    const dir = tmpSettings({ "labels.json": "   ", "rulesets.json": "{nope" });
    assert.equal(readDesiredFile("labels", dir), null);
    assert.throws(() => readDesiredFile("rulesets", dir), /invalid JSON/);
    assert.equal(readDesiredFile("labels", path.join(dir, "missing")), null);
  });

  test("planAll reports undeclared resources as skipped and computes drift", async () => {
    const dir = tmpSettings({ "labels.json": LABELS_FILE });
    const { client } = fakeClient({ "GET /repos/o/r/labels": [] });
    const report = await planAll({ client, repo: { owner: "o", name: "r" }, settingsDir: dir });
    assert.equal(report.drift, true);
    assert.deepEqual(
      report.resources.map((r) => [r.name, r.declared, r.drift]),
      [
        ["labels", true, true],
        ["rulesets", false, false],
      ],
    );
    assert.deepEqual(report.resources[0].counts, { create: 1 });
  });

  test("applyAll only touches resources with drift", async () => {
    const dir = tmpSettings({ "labels.json": LABELS_FILE, "rulesets.json": RULESETS_FILE });
    const { client, calls } = fakeClient({
      "GET /repos/o/r/labels": [{ name: "a", color: "000000", description: "" }],
      "GET /repos/o/r/rulesets": [],
      "POST /repos/o/r/rulesets": { status: 201, body: { id: 1 } },
    });
    const report = await applyAll({ client, repo: { owner: "o", name: "r" }, settingsDir: dir });
    assert.deepEqual(
      report.applied.map((a) => a.name),
      ["rulesets"],
    );
    assert.ok(calls.some((c) => c.method === "POST" && c.path === "/repos/o/r/rulesets"));
    assert.ok(!calls.some((c) => c.method !== "GET" && c.path.includes("labels")));
  });

  test("summarize counts op types and flags drift only for mutating ops", () => {
    const s = summarize("labels", [{ type: "noop" }, { type: "unmanaged" }]);
    assert.equal(s.drift, false);
    assert.deepEqual(s.counts, { noop: 1, unmanaged: 1 });
    assert.equal(summarize("labels", [{ type: "rename" }]).drift, true);
  });

  test("applyAll rejects ambiguous rulesets before applying earlier label drift", async () => {
    const dir = tmpSettings({ "labels.json": LABELS_FILE, "rulesets.json": RULESETS_FILE });
    const ruleset = RULESETS_FILE.rulesets[0];
    const { client, calls } = fakeClient({
      "GET /repos/o/r/labels": [],
      "GET /repos/o/r/rulesets": [{ id: 77 }, { id: 88 }],
      "GET /repos/o/r/rulesets/77": { ...ruleset, id: 77 },
      "GET /repos/o/r/rulesets/88": { ...ruleset, id: 88, enforcement: "disabled" },
    });
    try {
      await assert.rejects(applyAll({ client, repo: { owner: "o", name: "r" }, settingsDir: dir }),
        /duplicate live ruleset name "p".*77.*88/);
      assert.equal(calls.length, 4);
      assert.ok(calls.every((c) => c.method === "GET"));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("cli settings", () => {
  const routes = () => ({
    "GET /repos/o/r/labels": [{ name: "zzz-unmanaged", color: "ffffff", description: "" }],
    "GET /repos/o/r/rulesets": [],
  });

  test("plan prints text and exits 0 even with drift", async () => {
    const { client } = fakeClient(routes());
    const { out, io } = capture();
    const code = await main(["settings", "plan", "--repo", "o/r"], { ...io, client });
    assert.equal(code, EXIT.OK);
    const text = out.join("\n");
    assert.match(text, /repository: o\/r/);
    assert.match(text, /labels: drift detected/);
    assert.match(text, /\? unmanaged zzz-unmanaged/);
    assert.match(text, /result: drift/);
  });

  test("check exits 2 on drift and 0 when in sync", async () => {
    const drift = fakeClient(routes());
    assert.equal(await main(["settings", "check", "--repo", "o/r", "--only", "labels"], { ...capture().io, client: drift.client }), EXIT.FAILED);

    const synced = fakeClient({
      "GET /repos/o/r/labels": JSON.parse(fs.readFileSync(path.join(REPO_ROOT, ".github/control-plane/settings/labels.json"), "utf8")).labels,
    });
    assert.equal(await main(["settings", "check", "--repo", "o/r", "--only", "labels"], { ...capture().io, client: synced.client }), EXIT.OK);
  });

  test("apply refuses without --yes and applies with it", async () => {
    const a = capture();
    const { client, calls } = fakeClient({ ...routes(), "POST /repos/o/r/labels": { status: 201, body: {} } });
    assert.equal(await main(["settings", "apply", "--repo", "o/r", "--only", "labels"], { ...a.io, client }), EXIT.ERROR);
    assert.match(a.err[0], /refusing to mutate/);
    assert.equal(calls.length, 0);

    const b = capture();
    assert.equal(await main(["settings", "apply", "--repo", "o/r", "--only", "labels", "--yes"], { ...b.io, client }), EXIT.OK);
    assert.ok(calls.filter((c) => c.method === "POST").length > 0);
    assert.match(b.out.at(-1), /applied \d+ changes/);
  });

  test("apply --yes reports ambiguous live names and performs no mutations", async () => {
    const ruleset = { name: "ambiguous", target: "branch", enforcement: "active", rules: [] };
    const { client, calls } = fakeClient({
      "GET /repos/o/r/labels": [],
      "GET /repos/o/r/rulesets": [{ id: 77 }, { id: 88 }],
      "GET /repos/o/r/rulesets/77": { ...ruleset, id: 77 },
      "GET /repos/o/r/rulesets/88": { ...ruleset, id: 88 },
    });
    const { err, io } = capture();
    assert.equal(await main(["settings", "apply", "--repo", "o/r", "--yes"], { ...io, client }), EXIT.ERROR);
    assert.match(err.join("\n"), /duplicate live ruleset name "ambiguous".*77.*88/);
    assert.equal(calls.length, 4);
    assert.ok(calls.every((c) => c.method === "GET"));
  });

  test("export prints desired-file JSON for a resource", async () => {
    const { client } = fakeClient(routes());
    const { out, io } = capture();
    assert.equal(await main(["settings", "export", "labels", "--repo", "o/r"], { ...io, client }), EXIT.OK);
    const doc = JSON.parse(out.join("\n"));
    assert.equal(doc.labels[0].name, "zzz-unmanaged");
  });

  test("json and markdown formats, --summary writes the step summary", async () => {
    const { client } = fakeClient(routes());
    const summaryFile = path.join(os.tmpdir(), `cp-summary-${process.pid}.md`);
    fs.writeFileSync(summaryFile, "");
    try {
      const j = capture();
      await main(["settings", "plan", "--repo", "o/r", "--format", "json"], { ...j.io, client });
      assert.equal(JSON.parse(j.out.join("\n")).repo.owner, "o");

      const m = capture();
      m.io.env = { GITHUB_STEP_SUMMARY: summaryFile };
      await main(["settings", "plan", "--repo", "o/r", "--format", "markdown", "--summary"], { ...m.io, client });
      assert.match(m.out.join("\n"), /### Settings plan: `o\/r`/);
      assert.match(fs.readFileSync(summaryFile, "utf8"), /Drift detected/);
    } finally {
      fs.unlinkSync(summaryFile);
    }
  });

  test("rejects bad subcommands, formats, and resources before touching the network", async () => {
    const { client, calls } = fakeClient(routes());
    for (const args of [
      ["settings", "wat"],
      ["settings", "plan", "--format", "xml"],
      ["settings", "plan", "--only", "nope"],
      ["settings", "export"],
    ]) {
      const c = capture();
      assert.equal(await main([...args, "--repo", "o/r"], { ...c.io, client }), EXIT.ERROR, args.join(" "));
    }
    assert.equal(calls.length, 0);
  });
});

describe("report formatting", () => {
  const report = {
    repo: { owner: "o", name: "r" },
    drift: true,
    resources: [
      {
        name: "labels",
        declared: true,
        drift: true,
        counts: { create: 1, rename: 1, noop: 1 },
        ops: [
          { type: "noop", name: "same", changes: [] },
          { type: "create", name: "new", after: { name: "new", color: "000000", description: "" }, changes: [{ path: "/name", from: undefined, to: "new" }, { path: "/color", from: undefined, to: "000000" }] },
          { type: "rename", name: "kind:bug", from: "bug", changes: [{ path: "/name", from: "bug", to: "kind:bug" }, { path: "/description", from: "a|b", to: "c" }] },
        ],
      },
      { name: "rulesets", declared: false, drift: false, counts: {}, ops: [] },
    ],
  };

  test("text hides noops unless verbose", () => {
    assert.doesNotMatch(formatPlanText(report), /same/);
    assert.match(formatPlanText(report, { verbose: true }), /= noop {6}same/);
    assert.match(formatPlanText(report), /rulesets: not declared/);
  });

  test("markdown escapes pipes and omits name change rows for create/rename", () => {
    const md = formatPlanMarkdown(report);
    assert.match(md, /\\\|/);
    assert.match(md, /`bug → kind:bug`/);
    assert.doesNotMatch(md, /`\/name`/);
  });


  test("writeStepSummary is a no-op without GITHUB_STEP_SUMMARY", () => {
    assert.equal(writeStepSummary("x", {}), false);
  });
});
describe("evidence reporting formats", () => {
  const args = ["evidence", "--task", path.join(EXAMPLES, "task.example.json"), "--sha", "0".repeat(40)];

  test("JSON includes checklists while output remains a standalone evidence contract", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cp-evidence-"));
    try {
      const file = path.join(dir, "evidence.json");
      const c = capture();
      assert.equal(await main([...args, "--path", "src/cli.js", "--output", file], c.io), EXIT.OK);
      const result = JSON.parse(c.out[0]);
      assert.ok(result.review_domains.covered[0].checks.length > 0);
      assert.deepEqual(result.review_domains.required_roles, ["reviewer"]);
      const saved = JSON.parse(fs.readFileSync(file, "utf8"));
      assert.deepEqual(saved, result.evidence);
      assert.equal(Object.hasOwn(saved, "review_domains"), false);
      assert.equal(await main(["validate", file], capture().io), EXIT.OK);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  test("Markdown and summary show every checklist and uncovered paths; warning does not fail gates", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cp-evidence-"));
    try {
      const summary = path.join(dir, "summary.md");
      const taskFile = path.join(dir, "task.json");
      const task = JSON.parse(fs.readFileSync(path.join(EXAMPLES, "task.example.json"), "utf8"));
      task.scope.allowed_paths.push("notes/**");
      fs.writeFileSync(taskFile, JSON.stringify(task));
      fs.writeFileSync(summary, "existing\n");
      const c = capture();
      c.io.env.GITHUB_STEP_SUMMARY = summary;
      assert.equal(await main(["evidence", "--task", taskFile, "--sha", "0".repeat(40), "--path", "src/cli.js", "--path", "notes/a.txt", "--format", "markdown", "--summary"], c.io), EXIT.OK);
      const { loadReviewDomains } = await import("../../src/review-domains.js");
      const decoded = c.out[0].replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
      for (const check of loadReviewDomains().domains[0].checks) assert.ok(decoded.includes(check));
      assert.match(c.out[0], /Uncovered paths/);
      assert.match(c.out[0], /not proof of completed reviews/);
      assert.equal(fs.readFileSync(summary, "utf8"), `existing\n${c.out[0]}\n\n`);
      assert.equal(await main([...args, "--summary"], capture().io), EXIT.OK);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  test("rejects unsupported formats before reading task or writing output and summary", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cp-evidence-"));
    try {
      const output = path.join(dir, "out.json");
      const summary = path.join(dir, "summary.md");
      fs.writeFileSync(output, "unchanged");
      fs.writeFileSync(summary, "unchanged");
      const c = capture();
      c.io.env.GITHUB_STEP_SUMMARY = summary;
      assert.equal(await main(["evidence", "--task", "/missing", "--sha", "0".repeat(40), "--format", "xml", "--output", output, "--summary"], c.io), EXIT.ERROR);
      assert.match(c.err[0], /unknown format/);
      assert.equal(fs.readFileSync(output, "utf8"), "unchanged");
      assert.equal(fs.readFileSync(summary, "utf8"), "unchanged");
      assert.deepEqual(c.out, []);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  test("formatter renders security roles and escapes Markdown, HTML and line breaks", async () => {
    const { formatEvidenceMarkdown } = await import("../../src/lib/report.js");
    const hostile = "a|`<img src=x>\n# forged [link](url)&";
    const md = formatEvidenceMarkdown({
      evidence: { id: "evidence_test", task_id: "task_test", subject: { sha: "0".repeat(40) }, policy_results: [] },
      gates: { evidence_collected: true, within_scope: true, within_budget: true },
      review_domains: {
        covered: [{ domain: "firmware", role: "reviewer", security_role: "security_auditor", checks: [hostile], paths: [hostile] }],
        uncovered: [hostile], required_roles: ["reviewer"], required_security_roles: ["security_auditor"],
      },
    });
    assert.match(md, /security&#95;auditor/);
    assert.doesNotMatch(md, /<img|\n# forged|\[link\]\(url\)|a\|`/);
    assert.match(md, /&#124;/);
    assert.match(md, /&#96;/);
    assert.match(md, /&lt;img/);
    assert.match(md, /&amp;/);
  });
});

describe("cli project decoupling and spending", () => {
  function createConsumerProject() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cp-consumer-"));
    const cpDir = path.join(dir, ".github", "control-plane");
    const orchDir = path.join(cpDir, "orchestration");
    const polDir = path.join(cpDir, "policies");
    const setDir = path.join(cpDir, "settings");
    fs.mkdirSync(orchDir, { recursive: true });
    fs.mkdirSync(polDir, { recursive: true });
    fs.mkdirSync(setDir, { recursive: true });

    // Copy engine's valid state machine & approvals to simulate a valid consumer
    fs.copyFileSync(
      path.join(REPO_ROOT, ".github", "control-plane", "orchestration", "state-machine.yaml"),
      path.join(orchDir, "state-machine.yaml"),
    );
    fs.copyFileSync(
      path.join(REPO_ROOT, ".github", "control-plane", "policies", "approvals.yaml"),
      path.join(polDir, "approvals.yaml"),
    );
    fs.writeFileSync(
      path.join(setDir, "labels.json"),
      JSON.stringify({
        schema_version: "1.0.0",
        labels: [{ name: "consumer-label", color: "112233", description: "from consumer" }],
      }),
    );
    return { dir, cpDir, orchDir, polDir, setDir };
  }

  test("policy check with valid --project succeeds", async () => {
    const { dir } = createConsumerProject();
    try {
      const c = capture();
      const code = await main(["policy", "check", "--project", dir], c.io);
      assert.equal(code, EXIT.OK);
      assert.ok(c.out.some((l) => l.includes("policy: ok")));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("policy check with nonexistent --project fails actionably", async () => {
    const c = capture();
    const code = await main(["policy", "check", "--project", "/nonexistent-dir-for-test"], c.io);
    assert.equal(code, EXIT.ERROR);
    assert.match(c.err[0], /consumer project directory not found/);
  });

  test("policy check with explicit --project missing state-machine fails actionably", async () => {
    const { dir, orchDir } = createConsumerProject();
    try {
      fs.unlinkSync(path.join(orchDir, "state-machine.yaml"));
      const c = capture();
      const code = await main(["policy", "check", "--project", dir], c.io);
      assert.equal(code, EXIT.ERROR);
      assert.match(c.err[0], /state machine not found/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("policy stages with explicit --project calculates human stages", async () => {
    const { dir } = createConsumerProject();
    try {
      const c = capture();
      const code = await main(["policy", "stages", "--project", dir, "--risk", "low"], c.io);
      assert.equal(code, EXIT.OK);
      assert.match(c.out[0], /human approval required at: merge/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("settings plan with explicit --project reads consumer settings", async () => {
    const { dir } = createConsumerProject();
    try {
      const { client } = fakeClient({
        "GET /repos/o/r/labels": [],
        "GET /repos/o/r/rulesets": [],
      });
      const c = capture();
      const code = await main(["settings", "plan", "--project", dir, "--repo", "o/r", "--only", "labels"], {
        ...c.io,
        client,
      });
      assert.equal(code, EXIT.OK);
      const output = c.out.join("\n");
      assert.match(output, /consumer-label/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("settings plan with explicit --project missing settings dir fails actionably", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cp-empty-consumer-"));
    try {
      const { client } = fakeClient({});
      const c = capture();
      const code = await main(["settings", "plan", "--project", dir, "--repo", "o/r"], {
        ...c.io,
        client,
      });
      assert.equal(code, EXIT.ERROR);
      assert.match(c.err[0], /consumer settings directory not found/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });




  test("evidence with explicit --project uses consumer review domains or empty fallback", async () => {
    const { dir } = createConsumerProject();
    const taskFile = path.join(dir, "task.json");
    const task = JSON.parse(fs.readFileSync(path.join(EXAMPLES, "task.example.json"), "utf8"));
    fs.writeFileSync(taskFile, JSON.stringify(task));

    try {
      // 1. Without .review-domains.json in consumer, review domains should be empty (not engine's)
      const c1 = capture();
      const code1 = await main(
        ["evidence", "--project", dir, "--task", taskFile, "--sha", "0".repeat(40), "--path", "src/cli.js"],
        c1.io,
      );
      assert.equal(code1, EXIT.OK);
      const res1 = JSON.parse(c1.out[0]);
      assert.equal(res1.review_domains.covered.length, 0);

      // 2. With consumer .review-domains.json
      fs.writeFileSync(
        path.join(dir, ".review-domains.json"),
        JSON.stringify({
          schema_version: 1,
          domains: [
            {
              id: "consumer-domain",
              enabled: true,
              language: "javascript",
              role: "reviewer",
              paths: ["src/**"],
              checks: ["Ensure that all consumer guidelines are respected by every change."],
            },
          ],
        }),
      );
      const c2 = capture();
      const code2 = await main(
        ["evidence", "--project", dir, "--task", taskFile, "--sha", "0".repeat(40), "--path", "src/cli.js"],
        c2.io,
      );
      assert.equal(code2, EXIT.OK);
      const res2 = JSON.parse(c2.out[0]);
      assert.equal(res2.review_domains.covered[0].domain, "consumer-domain");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

});

describe("cli compact", () => {
  test("compacts log file in offline mode and outputs text", async () => {
    const tmpLog = path.join(os.tmpdir(), `cp-test-log-${process.pid}.txt`);
    const progressLines = Array.from({ length: 40 }, (_, i) => `build step ${i} compiling`).join("\n");
    const rawContent = `Start compilation\n${progressLines}\nFatalError: syntax error at main.rs:12\n${progressLines}\nExit code: 1`;
    fs.writeFileSync(tmpLog, rawContent, "utf8");

    try {
      const { out, io } = capture();
      const code = await main(["compact", "--file", tmpLog, "--max-chars", "400", "--offline"], io);
      assert.equal(code, EXIT.OK);
      const text = out.join("\n");
      assert.ok(text.length <= 400);
      assert.match(text, /FatalError/);
      assert.match(text, /Exit code: 1/);
    } finally {
      fs.unlinkSync(tmpLog);
    }
  });

  test("compacts from stdin and formats report as json with --output", async () => {
    const tmpOut = path.join(os.tmpdir(), `cp-compact-out-${process.pid}.txt`);
    const progressLines = Array.from({ length: 30 }, (_, i) => `downloading pkg ${i}`).join("\n");
    const stdinContent = `npm test start\n${progressLines}\nAssertionError: expected true but got false\n${progressLines}\nexited 1`;

    try {
      const { out, io } = capture();
      io.stdin = stdinContent;
      const code = await main([
        "compact",
        "--max-chars", "500",
        "--offline",
        "--format", "json",
        "--output", tmpOut,
      ], io);
      assert.equal(code, EXIT.OK);
      const parsed = JSON.parse(out.join("\n"));
      assert.equal(parsed.method, "deterministic");
      assert.ok(parsed.compactedChars <= 500);
      assert.match(parsed.compacted, /AssertionError/);

      const saved = fs.readFileSync(tmpOut, "utf8");
      assert.equal(saved, parsed.compacted);
    } finally {
      if (fs.existsSync(tmpOut)) fs.unlinkSync(tmpOut);
    }
  });

  test("compact validates arguments and inputs", async () => {
    const c1 = capture();
    assert.equal(await main(["compact", "--file", "nonexistent.txt", "--offline"], c1.io), EXIT.ERROR);
    assert.match(c1.err[0], /cannot read file/);

    const c2 = capture();
    assert.equal(await main(["compact", "--max-chars", "bad-num", "--offline"], c2.io), EXIT.ERROR);
    assert.match(c2.err[0], /invalid --max-chars/);

    const c3 = capture();
    assert.equal(await main(["compact", "--format", "yaml", "--offline"], c3.io), EXIT.ERROR);
    assert.match(c3.err[0], /unknown format/);
  });
});

test("removed provider commands are rejected", async () => {
  for (const command of ["triage", "spending"]) {
    const c = capture();
    assert.equal(await main([command], c.io), EXIT.ERROR);
    assert.match(c.err.join("\n"), /unknown command/);
  }
});
