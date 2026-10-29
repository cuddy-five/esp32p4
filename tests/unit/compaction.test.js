import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  chunkLog,
  compactLogs,
  deterministicScoreChunk,
} from "../../src/compaction.js";

describe("chunkLog", () => {
  test("chunks multiline text and groups stack frames with the error line", () => {
    const log = [
      "Starting build pipeline...",
      "Compiling module A",
      "Compiling module B",
      "Error: failed to compile module C",
      "    at Compiler.compile (/src/compiler.js:42:15)",
      "    at BuildPipeline.run (/src/pipeline.js:10:5)",
      "Finished with exit code 1",
    ].join("\n");

    const chunks = chunkLog(log, 3);
    assert.ok(chunks.length >= 2);
    // Find the chunk with the error
    const errChunk = chunks.find((c) => c.text.includes("failed to compile module C"));
    assert.ok(errChunk);
    assert.ok(errChunk.text.includes("Compiler.compile"));
    assert.ok(errChunk.text.includes("BuildPipeline.run"));
  });

  test("returns empty array on empty input", () => {
    assert.deepEqual(chunkLog(""), []);
    assert.deepEqual(chunkLog(null), []);
  });
});

describe("deterministicScoreChunk", () => {
  test("assigns high scores to errors, head, and tail", () => {
    assert.equal(deterministicScoreChunk("Invocation: node src/cli.js build", 0, 10), 2.5);
    assert.equal(deterministicScoreChunk("Exit code 1", 9, 10), 3.0);
    assert.equal(deterministicScoreChunk("AssertionError: expected true but got false", 4, 10), 3.0);
    assert.equal(deterministicScoreChunk("warning: deprecated API used", 4, 10), 2.0);
    assert.equal(deterministicScoreChunk("[ 45% ] downloading package.tar.gz 500 kB/s", 4, 10), 0.1);
  });
});


describe("compactLogs", () => {
  test("returns unchanged when text is within maxChars", async () => {
    const shortLog = "build started\nbuild finished\nok";
    const res = await compactLogs(shortLog, { maxChars: 500 });
    assert.equal(res.compacted, shortLog);
    assert.equal(res.originalChars, shortLog.length);
    assert.equal(res.compactedChars, shortLog.length);
    assert.equal(res.reductionPercent, 0);
  });

  test("compacts long repetitive logs while preserving error and exit status verbatim", async () => {
    const progressLines = Array.from({ length: 60 }, (_, i) => `[step ${i}] downloading asset at 200 kB/s`).join("\n");
    const longLog = [
      "Invocation: npm run test:e2e",
      progressLines,
      "AssertionError: expected status 200 but got 500 in auth_spec.js:84",
      "    at Runner.check (/tests/e2e.js:42:9)",
      progressLines,
      "Process exited with code 1",
    ].join("\n");

    const res = await compactLogs(longLog, { maxChars: 650, offline: true });
    assert.ok(res.compactedChars <= 650);
    assert.match(res.compacted, /Invocation: npm run test:e2e/);
    assert.match(res.compacted, /AssertionError: expected status 200/);
    assert.match(res.compacted, /Process exited with code 1/);
    assert.match(res.compacted, /pruned by context compaction/);
    assert.ok(res.reductionPercent > 50);
    assert.equal(res.method, "deterministic");
  });

  test("handles single huge line gracefully without destroying output", async () => {
    const hugeLine = `AssertionFailure: ${"X".repeat(4000)}`;
    const res = await compactLogs(hugeLine, { maxChars: 300, offline: true });
    assert.ok(res.compactedChars <= 300);
    assert.ok(res.compactedChars > 0);
    assert.match(res.compacted, /AssertionFailure:/);
    assert.match(res.compacted, /\[truncated\]/);
  });


  test("strictly respects maxChars when maxChars < 15 and never expands", async () => {
    const long = "abcdefghijklmnopqrstuvwxyz".repeat(10);
    const res1 = await compactLogs(long, { maxChars: 8 });
    assert.ok(res1.compactedChars <= 8);
    assert.equal(res1.compacted, "abcdefgh");
    assert.ok(res1.reductionPercent >= 0);

    const res2 = await compactLogs("hello world 123", { maxChars: 10 });
    assert.ok(res2.compactedChars <= 10);
    assert.equal(res2.compacted, "hello worl");
    assert.ok(res2.reductionPercent >= 0);
  });

  test("emits prune notice when single line chunk is pruned", async () => {
    const text = [
      "Invocation: test-runner",
      ...Array.from({ length: 20 }, (_, i) => `Single progress line ${i} downloading asset`),
      "Exit code: 0",
    ].join("\n");
    const res = await compactLogs(text, { maxChars: 300, offline: true });
    assert.match(res.compacted, /Invocation: test-runner/);
    assert.match(res.compacted, /Exit code: 0/);
    assert.match(res.compacted, /pruned by context compaction/);
    assert.ok(res.compactedChars <= 300);
  });
});

test("default compaction is local and does not access the network", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw new Error("Network access forbidden"); };
  try {
    const text = "Invocation: build\n" + "building module\n".repeat(100) + "Process exited with code 1";
    const result = await compactLogs(text, { maxChars: 400 });
    assert.equal(calls, 0);
    assert.equal(result.method, "deterministic");
    assert.ok(result.compacted.length <= 400);
    assert.match(result.compacted, /Process exited with code 1/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
