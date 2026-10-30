import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { GitHubApiError, GitHubClient, parseLinkHeader, parseRepo, repoFromRemoteUrl, resolveRepo } from "../../src/lib/github.js";
import { fakeClient } from "../helpers/fake-github.js";

describe("GitHubClient.request", () => {
  test("sends bearer auth, api version, and JSON body", async () => {
    const { client, calls } = fakeClient({ "POST /repos/o/r/labels": { name: "x" } });
    const { status, data } = await client.request("POST", "/repos/o/r/labels", { body: { name: "x" } });
    assert.equal(status, 200);
    assert.deepEqual(data, { name: "x" });
    assert.deepEqual(calls[0].body, { name: "x" });
  });

  test("throws GitHubApiError with status and message on failure", async () => {
    const { client } = fakeClient({
      "DELETE /repos/o/r/labels/x": { status: 403, body: { message: "Resource not accessible by integration" } },
    });
    await assert.rejects(
      () => client.request("DELETE", "/repos/o/r/labels/x"),
      (err) => {
        assert.ok(err instanceof GitHubApiError);
        assert.equal(err.status, 403);
        assert.match(err.message, /DELETE \/repos\/o\/r\/labels\/x -> 403: Resource not accessible/);
        return true;
      },
    );
  });

  test("retries retryable statuses with backoff and honours Retry-After", async () => {
    const waits = [];
    const { client, calls } = fakeClient(
      {
        "GET /ping": [
          { status: 503, body: { message: "unavailable" } },
          { status: 429, body: { message: "slow down" }, headers: { "retry-after": "2" } },
          { status: 200, body: { ok: true } },
        ],
      },
      { sleep: async (ms) => waits.push(ms), backoffMs: 100 },
    );
    const { data } = await client.request("GET", "/ping");
    assert.deepEqual(data, { ok: true });
    assert.equal(calls.length, 3);
    assert.deepEqual(waits, [100, 2000]);
  });

  test("gives up after the configured number of retries", async () => {
    const { client, calls } = fakeClient(
      { "GET /ping": [{ status: 500, body: "" }, { status: 500, body: "" }] },
      { retries: 1 },
    );
    await assert.rejects(() => client.request("GET", "/ping"), GitHubApiError);
    assert.equal(calls.length, 2);
  });

  test("requires a token", () => {
    assert.throws(() => new GitHubClient({ token: "" }), /no GitHub token/);
  });

  test("handles empty 204 bodies", async () => {
    const { client } = fakeClient({ "DELETE /x": { status: 204, body: "" } });
    const { status, data } = await client.request("DELETE", "/x");
    assert.equal(status, 204);
    assert.equal(data, null);
  });
});

describe("GitHubClient.paginate", () => {
  test("follows Link rel=next and concatenates pages", async () => {
    const { client, calls } = fakeClient({
      "GET /repos/o/r/labels": ({ query }) =>
        query.page === "2"
          ? { status: 200, body: [{ name: "c" }] }
          : {
              status: 200,
              body: [{ name: "a" }, { name: "b" }],
              headers: {
                link: '<https://api.example.test/repos/o/r/labels?per_page=100&page=2>; rel="next", <https://api.example.test/repos/o/r/labels?per_page=100&page=2>; rel="last"',
              },
            },
    });
    const all = await client.paginate("/repos/o/r/labels");
    assert.deepEqual(
      all.map((l) => l.name),
      ["a", "b", "c"],
    );
    assert.equal(calls.length, 2);
    assert.equal(calls[0].query.per_page, "100");
  });

  test("rejects non-array pages", async () => {
    const { client } = fakeClient({ "GET /thing": { id: 1 } });
    await assert.rejects(() => client.paginate("/thing"), /expected array page/);
  });
});

describe("parseLinkHeader", () => {
  test("parses rel targets", () => {
    assert.deepEqual(parseLinkHeader('<https://a/x?page=2>; rel="next", <https://a/x?page=9>; rel="last"'), {
      next: "https://a/x?page=2",
      last: "https://a/x?page=9",
    });
  });
  test("returns empty object for null", () => {
    assert.deepEqual(parseLinkHeader(null), {});
  });
});

describe("repository resolution", () => {
  test("parseRepo accepts owner/name and strips .git", () => {
    assert.deepEqual(parseRepo("octo-org/my.repo.git"), { owner: "octo-org", name: "my.repo" });
    assert.throws(() => parseRepo("just-a-name"), /expected owner\/name/);
  });

  test("repoFromRemoteUrl handles https, ssh, and tokenised URLs", () => {
    assert.deepEqual(repoFromRemoteUrl("https://github.com/o/r.git"), { owner: "o", name: "r" });
    assert.deepEqual(repoFromRemoteUrl("git@github.com:o/r.git"), { owner: "o", name: "r" });
    assert.deepEqual(repoFromRemoteUrl("https://x-access-token:abc@github.com/o/r"), { owner: "o", name: "r" });
    assert.equal(repoFromRemoteUrl("nonsense"), null);
  });

  test("resolveRepo prefers explicit, then GH_REPO, then GITHUB_REPOSITORY", () => {
    assert.deepEqual(resolveRepo("a/b", { env: { GH_REPO: "c/d" } }), { owner: "a", name: "b" });
    assert.deepEqual(resolveRepo(undefined, { env: { GH_REPO: "c/d", GITHUB_REPOSITORY: "e/f" } }), {
      owner: "c",
      name: "d",
    });
    assert.deepEqual(resolveRepo(undefined, { env: { GITHUB_REPOSITORY: "e/f" } }), { owner: "e", name: "f" });
  });

  test("resolveRepo throws outside a git checkout with no hints", () => {
    assert.throws(() => resolveRepo(undefined, { env: {}, cwd: "/" }), /could not determine repository/);
  });
});

describe("GitHubClient write safety", () => {
  test("a 5xx after POST or PATCH is not retried, because the write may have happened", async () => {
    for (const method of ["POST", "PATCH"]) {
      const { client, calls } = fakeClient({
        [`${method} /repos/o/r/rulesets`]: [
          { status: 502, body: { message: "bad gateway" } },
          { status: 201, body: { id: 1 } },
        ],
      });
      await assert.rejects(() => client.request(method, "/repos/o/r/rulesets", { body: {} }), (err) => err.status === 502);
      assert.equal(calls.length, 1, method);
    }
  });

  test("idempotent methods and rate limits are still retried", async () => {
    const { client, calls } = fakeClient({
      "PUT /repos/o/r/rulesets/7": [{ status: 503, body: {} }, { status: 200, body: { ok: 1 } }],
      "POST /repos/o/r/labels": [{ status: 429, body: {} }, { status: 201, body: { name: "x" } }],
    });
    assert.deepEqual((await client.request("PUT", "/repos/o/r/rulesets/7", { body: {} })).data, { ok: 1 });
    assert.deepEqual((await client.request("POST", "/repos/o/r/labels", { body: {} })).data, { name: "x" });
    assert.equal(calls.length, 4);
  });

  test("dot segments are refused before any request is sent", async () => {
    const { client, calls } = fakeClient({});
    for (const p of ["/repos/o/r/labels/..", "/repos/o/r/labels/.", "/repos/o/r/labels/%2e%2E", "/repos/../user/labels"]) {
      await assert.rejects(() => client.request("DELETE", p), /not valid path segments/, p);
    }
    assert.equal(calls.length, 0);
  });

  test("repository names cannot be dot segments", () => {
    for (const s of ["../user", "./x", "o/..", "o/."]) assert.throws(() => parseRepo(s), /invalid repository/, s);
    assert.equal(repoFromRemoteUrl("git@github.com:../user.git"), null);
    assert.deepEqual(parseRepo("o/my.repo"), { owner: "o", name: "my.repo" });
  });
});
