import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  DEFAULT_DAILY_CAP_USD,
  PRICE_PER_INPUT_TOKEN_USD,
  checkSpendingCap,
  loadApiKey,
  loadJevLedger,
  recordJevUsage,
  requestJev,
} from "../../src/jev.js";

describe("Jev daily spending cap & ledger", () => {
  test("default daily cap is set to $2.00", () => {
    assert.equal(DEFAULT_DAILY_CAP_USD, 2.0);
    assert.equal(PRICE_PER_INPUT_TOKEN_USD, 0.042 / 1_000_000);
  });

  test("loadJevLedger initializes a fresh record for today", () => {
    const tmp = path.join(os.tmpdir(), `jev-led-init-${process.pid}.json`);
    try {
      const ledger = loadJevLedger({ ledgerPath: tmp, dateStr: "2026-10-26" });
      assert.equal(ledger.date, "2026-10-26");
      assert.equal(ledger.total_spent_usd, 0);
      assert.equal(ledger.calls, 0);
      assert.equal(ledger.daily_cap_usd, 2.0);
    } finally {
      if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
    }
  });

  test("recordJevUsage updates tokens, calculates cost, and writes to disk", () => {
    const tmp = path.join(os.tmpdir(), `jev-led-rec-${process.pid}.json`);
    try {
      const usage = { input_tokens: 1000000, output_tokens: 250 };
      const updated = recordJevUsage(usage, { ledgerPath: tmp, dateStr: "2026-10-26" });
      assert.equal(updated.calls, 1);
      assert.equal(updated.total_input_tokens, 1000000);
      assert.equal(updated.total_output_tokens, 250);
      assert.equal(updated.total_spent_usd, 0.042);

      const reloaded = loadJevLedger({ ledgerPath: tmp, dateStr: "2026-10-26" });
      assert.equal(reloaded.total_spent_usd, 0.042);
      assert.equal(reloaded.calls, 1);
    } finally {
      if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
    }
  });

  test("checkSpendingCap allows within budget and rejects when ceiling exceeded", () => {
    const tmp = path.join(os.tmpdir(), `jev-led-cap-${process.pid}.json`);
    try {
      // Under cap -> passes
      assert.doesNotThrow(() => checkSpendingCap({ ledgerPath: tmp, dailyCapUsd: 2.0 }));

      // Record spending up to $2.00
      fs.writeFileSync(tmp, JSON.stringify({
        date: new Date().toISOString().slice(0, 10),
        daily_cap_usd: 2.0,
        total_spent_usd: 2.0005,
        total_input_tokens: 47630952,
        total_output_tokens: 1000,
        calls: 50,
      }));

      assert.throws(
        () => checkSpendingCap({ ledgerPath: tmp, dailyCapUsd: 2.0 }),
        /Jev daily spending cap reached \(\$2\.0005 \/ \$2\.00\)/,
      );
    } finally {
      if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
    }
  });

  test("new date resets the daily ledger counters", () => {
    const tmp = path.join(os.tmpdir(), `jev-led-date-${process.pid}.json`);
    try {
      // Yesterday's exhausted ledger
      fs.writeFileSync(tmp, JSON.stringify({
        date: "2026-10-25",
        daily_cap_usd: 2.0,
        total_spent_usd: 2.5,
        total_input_tokens: 60000000,
        total_output_tokens: 500,
        calls: 80,
      }));

      // Evaluating today (2026-10-26) resets
      const today = loadJevLedger({ ledgerPath: tmp, dateStr: "2026-10-26" });
      assert.equal(today.date, "2026-10-26");
      assert.equal(today.total_spent_usd, 0);
      assert.equal(today.calls, 0);
      assert.doesNotThrow(() => checkSpendingCap({ ledgerPath: tmp, dateStr: "2026-10-26", dailyCapUsd: 2.0 }));
    } finally {
      if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
    }
  });

  test("requestJev halts before network call when cap is exceeded", async () => {
    const tmp = path.join(os.tmpdir(), `jev-req-cap-${process.pid}.json`);
    fs.writeFileSync(tmp, JSON.stringify({
      date: new Date().toISOString().slice(0, 10),
      daily_cap_usd: 2.0,
      total_spent_usd: 2.01,
      total_input_tokens: 50000000,
      total_output_tokens: 1000,
      calls: 10,
    }));

    let networkCalled = false;
    const fakeFetch = async () => {
      networkCalled = true;
      return new Response("{}", { status: 200 });
    };

    const request = {
      model: "jev-latest",
      state: { request: "test" },
      questions: { q: { type: "noul", instructions: "test" } },
    };

    try {
      await assert.rejects(
        () => requestJev(request, {
          apiKey: "test-key",
          fetchImpl: fakeFetch,
          ledgerPath: tmp,
          dailyCapUsd: 2.0,
        }),
        /Jev daily spending cap reached/,
      );
      assert.equal(networkCalled, false, "Should not hit network when spending cap is exceeded");
    } finally {
      if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
    }
  });

  test("requestJev updates ledger on successful call", async () => {
    const tmp = path.join(os.tmpdir(), `jev-req-ok-${process.pid}.json`);
    const fakeFetch = async () => new Response(JSON.stringify({
      model: "jev-1.14.0",
      usage: { input_tokens: 10000, output_tokens: 5 },
      answers: { q: { type: "noul", noul: 0.9 } },
    }), { status: 200 });

    const request = {
      model: "jev-latest",
      state: { request: "test" },
      questions: { q: { type: "noul", instructions: "test" } },
    };

    try {
      const res = await requestJev(request, {
        apiKey: "test-key",
        fetchImpl: fakeFetch,
        ledgerPath: tmp,
        dailyCapUsd: 2.0,
      });
      assert.equal(res.model, "jev-1.14.0");
      assert.equal(res.spending.calls_today, 1);
      assert.ok(res.spending.total_spent_usd > 0);
      assert.equal(res.spending.daily_cap_usd, 2.0);

      const onDisk = JSON.parse(fs.readFileSync(tmp, "utf8"));
      assert.equal(onDisk.calls, 1);
      assert.equal(onDisk.total_input_tokens, 10000);
    } finally {
      if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
    }
  });

  test("loadApiKey resolves from environment variable", () => {
    const key = loadApiKey({ TYPESAFE_API_KEY: "secret-key-123" });
    assert.equal(key, "secret-key-123");
  });

  test("loadApiKey resolves from TYPESAFE_API_KEY_FILE with mode 0600", () => {
    const keyPath = path.join(os.homedir(), ".config", "esp32p4", `test-key-${process.pid}`);
    try {
      fs.mkdirSync(path.dirname(keyPath), { recursive: true });
      fs.writeFileSync(keyPath, "custom-file-key-456\n", { mode: 0o600 });
      const key = loadApiKey({ TYPESAFE_API_KEY_FILE: keyPath });
      assert.equal(key, "custom-file-key-456");
    } finally {
      if (fs.existsSync(keyPath)) fs.unlinkSync(keyPath);
    }
  });

  test("loadJevLedger throws clear error on corrupted JSON instead of resetting to $0", () => {
    const tmp = path.join(os.tmpdir(), `jev-led-corrupt-${process.pid}.json`);
    try {
      fs.writeFileSync(tmp, "NOT_VALID_JSON{foo:", "utf8");
      assert.throws(
        () => loadJevLedger({ ledgerPath: tmp }),
        /Jev ledger at .* is corrupted/,
      );
    } finally {
      if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
    }
  });
});
