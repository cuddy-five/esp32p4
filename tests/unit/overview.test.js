import assert from "node:assert/strict";
import { test } from "node:test";
import { buildOverview, formatOverview } from "../../src/lib/overview.js";
import { main } from "../../src/cli.js";
import { fakeClient } from "../helpers/fake-github.js";

const commit = (sha, date, message) => ({ sha, commit: { committer: { date }, message } });

/** A repository with one stranded branch, one merged branch, one branch with a PR and a fork PR. */
function routes(over = {}) {
  return {
    "GET /repos/o/r": { default_branch: "main" },
    "GET /repos/o/r/branches": [
      { name: "main", commit: { sha: "m1" } },
      { name: "feature/signing", commit: { sha: "s3" } },
      { name: "old/merged", commit: { sha: "m0" } },
      { name: "has-pr", commit: { sha: "p1" } },
      { name: "fork-name", commit: { sha: "f1" } },
    ],
    "GET /repos/o/r/pulls": [
      { number: 7, title: "Add a thing", head: { ref: "has-pr", repo: { full_name: "o/r" } }, draft: true, updated_at: "2026-11-12T10:00:00Z", html_url: "https://github.com/o/r/pull/7" },
      // A fork's branch shares a name with a branch here; it must not hide that branch.
      { number: 8, title: "From outside", head: { ref: "fork-name", repo: { full_name: "someone/r" } }, updated_at: "2026-11-11T10:00:00Z" },
    ],
    "GET /repos/o/r/compare/main...feature/signing": {
      ahead_by: 3, behind_by: 0,
      commits: [commit("s1", "2026-11-10T18:50:00Z", "one"), commit("s2", "2026-11-10T18:51:00Z", "two"), commit("s3", "2026-11-10T18:52:00Z", "Add the reader\n\nLong body that must not be printed.")],
    },
    "GET /repos/o/r/compare/main...old/merged": { ahead_by: 0, behind_by: 12, commits: [] },
    "GET /repos/o/r/compare/main...fork-name": { ahead_by: 1, behind_by: 2, commits: [commit("not-the-tip", "2026-11-01T00:00:00Z", "older")] },
    "GET /repos/o/r/issues": [
      { number: 21, title: "Settle the decisions", labels: [{ name: "needs-triage" }], html_url: "https://github.com/o/r/issues/21" },
      { number: 7, title: "Add a thing", pull_request: {} },
    ],
    ...over,
  };
}

test("overview finds work on a branch with no pull request and separates merged branches", async () => {
  const { client, calls } = fakeClient(routes());
  const report = await buildOverview({ client, repo: { owner: "o", name: "r" } });
  assert.equal(report.default_branch, "main");
  assert.deepEqual(report.unmerged_branches.map((b) => [b.branch, b.ahead, b.behind, b.newest.subject, b.newest.date]), [
    ["feature/signing", 3, 0, "Add the reader", "2026-11-10T18:52:00Z"],
    // The listed commit is not the branch tip, so no subject or date is claimed for it.
    ["fork-name", 1, 2, null, null],
  ]);
  assert.deepEqual(report.merged_branches, ["old/merged"]);
  assert.deepEqual(report.pull_requests.map((p) => [p.number, p.branch, p.draft, p.from_fork]), [[7, "has-pr", true, false], [8, "fork-name", false, true]]);
  assert.deepEqual(report.issues.map((i) => [i.number, i.labels]), [[21, ["needs-triage"]]], "a pull request is not listed again as an issue");
  // The branch with its own pull request, and the default branch, are not compared.
  assert.deepEqual(calls.filter((c) => c.path.includes("/compare/")).map((c) => c.path).sort(), [
    "/repos/o/r/compare/main...feature/signing", "/repos/o/r/compare/main...fork-name", "/repos/o/r/compare/main...old/merged",
  ]);
  assert.ok(calls.every((c) => c.method === "GET"), "the overview only reads");

  const text = formatOverview(report);
  assert.match(text, /Work that is not in main and has no pull request \(2 branches\):\n {2}feature\/signing {2}3 commits ahead, 0 behind; newest 2026-11-10: Add the reader\n {2}fork-name {2}1 commit ahead, 2 behind\n/);
  assert.doesNotMatch(text, /Long body/);
  assert.match(text, /Open pull requests \(2\):\n {2}#7 Add a thing \[draft\] {2}branch has-pr, updated 2026-11-12\n {2}#8 From outside \[from a fork\]/);
  assert.match(text, /Open issues \(1\):\n {2}#21 Settle the decisions \[needs-triage\]/);
  assert.match(text, /already in main \(1\): old\/merged\n {2}Deleting these loses nothing\./);
  assert.ok(text.indexOf("Work that is not in main") < text.indexOf("Open pull requests"), "stranded work comes first");
});

test("overview says so when nothing waits, and escapes text written by others", async () => {
  const quiet = fakeClient({
    "GET /repos/o/r": { default_branch: "main" },
    "GET /repos/o/r/branches": [{ name: "main", commit: { sha: "m1" } }],
    "GET /repos/o/r/pulls": [],
    "GET /repos/o/r/issues": [],
  });
  const text = formatOverview(await buildOverview({ client: quiet.client, repo: { owner: "o", name: "r" } }));
  assert.match(text, /has no pull request: none/);
  assert.match(text, /Open pull requests: none/);
  assert.match(text, /Open issues: none/);
  assert.doesNotMatch(text, /already in main/);

  const hostile = fakeClient(routes({
    "GET /repos/o/r/pulls": [{ number: 9, title: "ok\n::error::injected", head: { ref: "has-pr", repo: { full_name: "o/r" } } }],
    "GET /repos/o/r/issues": [{ number: 3, title: "t\r\n::warning::x", labels: ["a\nb"] }],
  }));
  const out = formatOverview(await buildOverview({ client: hostile.client, repo: { owner: "o", name: "r" } }));
  assert.ok(out.split("\n").every((line) => !line.startsWith("::")), "no output line can start a workflow command");
  assert.match(out, /#9 ok\\u000a::error::injected/);

  await assert.rejects(buildOverview({ client: fakeClient({ "GET /repos/o/r": {} }).client, repo: { owner: "o", name: "r" } }), /no default branch/);
});

test("overview CLI prints text or JSON and reports an unreadable repository as an error", async () => {
  const run = async (args, client) => {
    const out = [];
    const err = [];
    const code = await main(["overview", ...args], { stdout: (s) => out.push(s), stderr: (s) => err.push(s), env: {}, client });
    return { code, out: out.join("\n"), err: err.join("\n") };
  };
  let res = await run(["--repo", "o/r"], fakeClient(routes()).client);
  assert.equal(res.code, 0, res.err);
  assert.match(res.out, /^Overview of o\/r \(default branch main\)/);
  res = await run(["--repo", "o/r", "--format", "json"], fakeClient(routes()).client);
  assert.equal(JSON.parse(res.out).unmerged_branches[0].branch, "feature/signing");
  res = await run(["--repo", "o/r", "--format", "yaml"], fakeClient(routes()).client);
  assert.equal(res.code, 1);
  res = await run(["--repo", "o/missing"], fakeClient(routes()).client);
  assert.equal(res.code, 1);
  assert.match(res.err, /error: /);
});
