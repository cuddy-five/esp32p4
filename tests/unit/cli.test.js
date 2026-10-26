import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { EXIT, main } from "../../src/cli.js";
import { planAll, applyAll, readDesiredFile, selectResources, summarize } from "../../src/lib/settings/index.js";
import { formatPlanMarkdown, formatPlanText, formatTriageMarkdown, writeStepSummary } from "../../src/lib/report.js";
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
    assert.throws(
      () => execFileSync(process.execPath, [CLI, "validate", "/nonexistent.json"], { encoding: "utf8", stdio: "pipe" }),
      (e) => e.status === EXIT.FAILED,
    );
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

describe("cli triage and evidence", () => {
  test("triage requires --yes and synthesizes a validated contract with mocked Jev", async () => {
    const denied = capture();
    assert.equal(await main(["triage", "Fix build"], denied.io), EXIT.ERROR);
    assert.match(denied.err[0], /without --yes/);

    const fakeJevFetch = async (_url, init) => {
      const req = JSON.parse(init.body);
      const makeChoice = (qName, pick) => {
        const opts = Object.keys(req.questions[qName].criteria);
        const probs = Object.fromEntries(opts.map((o) => [o, o === pick ? 0.91 : 0.09 / (opts.length - 1)]));
        return { type: "choice", choice: pick, confidence: 0.91, probabilities: probs };
      };
      const body = {
        model: "jev-1.14.0",
        usage: { input_tokens: 100, output_tokens: 20 },
        answers: {
          workflow: makeChoice("workflow", "implement"),
          agent: makeChoice("agent", "implementer"),
          skill: makeChoice("skill", "tdd-guide"),
          prompt_injection: { type: "noul", noul: 0.02 },
          blast_radius: { type: "score", score: 1.0, confidence: 0.9, probabilities: [0.1, 0.8, 0.1, 0] },
          tag_secrets_auth: { type: "noul", noul: 0.05 },
          tag_ci_control_plane: { type: "noul", noul: 0.05 },
          tag_dependencies: { type: "noul", noul: 0.05 },
        },
      };
      return new Response(JSON.stringify(body), { status: 200 });
    };

    const outFile = path.join(os.tmpdir(), `cp-triage-${process.pid}.json`);
    const summaryFile = path.join(os.tmpdir(), `cp-triage-sum-${process.pid}.md`);
    fs.writeFileSync(summaryFile, "");
    try {
      const c = capture();
      c.io.env = { TYPESAFE_API_KEY: "test-key", GITHUB_STEP_SUMMARY: summaryFile };
      c.io.jevFetch = fakeJevFetch;
      const code = await main(
        ["triage", "--yes", "--issue", "7", "--output", outFile, "--summary", "Add hash unit tests"],
        c.io,
      );
      assert.equal(code, EXIT.OK);
      const saved = JSON.parse(fs.readFileSync(outFile, "utf8"));
      assert.equal(saved.contract, "task");
      assert.equal(saved.assigned_role, "implementer");
      assert.match(fs.readFileSync(summaryFile, "utf8"), /Jev System One Intake Triage/);
    } finally {
      if (fs.existsSync(outFile)) fs.unlinkSync(outFile);
      if (fs.existsSync(summaryFile)) fs.unlinkSync(summaryFile);
    }
  });

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

  test("formatTriageMarkdown formats Jev advice and contract summary", () => {
    const md = formatTriageMarkdown({
      advice: {
        resolved_model: "jev-1.14.0",
        disposition: "human_review",
        selections: { workflow: { choice: "implement", confidence: 1 } },
      },
      kind: "task",
      contract: { id: "task_1234", contract: "task" },
      human_stages: ["merge"],
    });
    assert.match(md, /Jev System One Intake Triage/);
    assert.match(md, /`task_1234`/);
  });

  test("writeStepSummary is a no-op without GITHUB_STEP_SUMMARY", () => {
    assert.equal(writeStepSummary("x", {}), false);
  });
});