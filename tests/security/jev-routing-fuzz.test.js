/**
 * Adversarial fuzzing and invariant test suite for Jev System One
 * decision, selection, intake, routing, and spending cap guardrails.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import defaultRegistry from "../../src/lib/registry.js";
import { ContractRegistry } from "../../src/lib/contracts.js";
import { checkPolicies } from "../../src/lib/orchestration.js";
import {
  checkChoiceAnswer,
  checkNoulAnswer,
  checkRequestInput,
  checkScoreAnswer,
  splitNoul,
} from "../../src/routing.js";
import {
  BLAST_RADIUS_CRITERIA,
  buildSelectionRequest,
  interpretSelectionResponse,
} from "../../src/selection.js";
import { synthesizeIntakeContract } from "../../src/triage.js";
import {
  checkSpendingCap,
  getLedgerPath,
  loadJevLedger,
  recordJevUsage,
} from "../../src/jev.js";

const contracts = new ContractRegistry();
const { approvals } = checkPolicies({});

describe("Loop A: Combinatorial Synthesis Fuzzing across All Registry Entities", () => {
  const workflows = defaultRegistry.getEnabledWorkflows();
  const agents = defaultRegistry.getEnabledAgents();
  const skills = defaultRegistry.getEnabledSkills();
  const riskLevels = ["low", "medium", "high", "critical"];

  const candidateTexts = [
    "Standard task request to update docs",
    "   \n\tFix \n\nwhitespace   in   parser\t\n ",
    "A".repeat(500), // Longer than max title length (200)
    "ab", // Very short (2 chars)
    "Fix 🐞 in `src/cli.js` with <script>alert('xss')</script>",
    "## Markdown Request\n> Quote block\n- Item 1\n- Item 2",
    "Special characters: !@#$%^&*()_+-=[]{}|;':\",./<>?",
  ];

  const tagCases = [
    [],
    ["auth"],
    ["secrets", "ci_cd"],
    ["dependencies", "infra", "billing"],
    ["auth", "secrets", "data_migration", "public_api", "ci_cd", "dependencies", "infra", "billing", "pii"],
  ];

  for (const workflow of workflows) {
    for (const agent of agents) {
      test(`Workflow "${workflow.id}" x Agent "${agent.id}" across permutations`, () => {
        for (const text of candidateTexts) {
          for (const riskLevel of riskLevels) {
            for (const riskTags of tagCases) {
              const advice = {
                mode: "advisory",
                disposition: "human_review",
                selections: {
                  workflow: { choice: workflow.id, confidence: 0.95 },
                  agent: { choice: agent.id, confidence: 0.95 },
                  skill: { choice: skills[0]?.id ?? null, confidence: 0.8 },
                },
                guardrails: {
                  risk_level: riskLevel,
                  risk_tags: riskTags,
                },
                resolved_model: "jev-system-one-fuzz",
              };

              const result = synthesizeIntakeContract(text, advice, {
                registry: defaultRegistry,
                contracts,
                policies: { approvals },
              });

              assert.equal(result.kind, "task");
              const val = contracts.validate(result.contract, { kind: "task" });
              assert.equal(
                val.ok,
                true,
                `Validation failed for ${workflow.id}/${agent.id} on text "${text.slice(0, 20)}": ${JSON.stringify(val.errors)}`,
              );
              assert.ok(result.contract.title.length >= 3 && result.contract.title.length <= 200);
              assert.ok(Array.isArray(result.human_stages));
            }
          }
        }
      });
    }
  }
});

describe("Loop B: Malformed and Boundary Response Fuzzing", () => {
  const options = ["change_request", "investigation", "question", "unclear"];

  test("probability sum boundary tolerances (exact +/- 0.02 threshold)", () => {
    // Exactly 0.02 below 1.0 -> 0.980 sum (valid)
    assert.doesNotThrow(() => {
      checkChoiceAnswer(
        {
          type: "choice",
          choice: "question",
          confidence: 0.9,
          probabilities: { change_request: 0.02, investigation: 0.03, question: 0.9, unclear: 0.03 },
        },
        options,
        "test",
      );
    });

    // Beyond 0.02 below 1.0 -> 0.979 sum (invalid)
    assert.throws(
      () => {
        checkChoiceAnswer(
          {
            type: "choice",
            choice: "question",
            confidence: 0.9,
            probabilities: { change_request: 0.02, investigation: 0.029, question: 0.9, unclear: 0.03 },
          },
          options,
          "test",
        );
      },
      /inconsistent/,
    );

    // Exactly 0.02 above 1.0 -> 1.020 sum (valid)
    assert.doesNotThrow(() => {
      checkChoiceAnswer(
        {
          type: "choice",
          choice: "question",
          confidence: 0.9,
          probabilities: { change_request: 0.04, investigation: 0.04, question: 0.9, unclear: 0.04 },
        },
        options,
        "test",
      );
    });

    // Beyond 0.02 above 1.0 -> 1.021 sum (invalid)
    assert.throws(
      () => {
        checkChoiceAnswer(
          {
            type: "choice",
            choice: "question",
            confidence: 0.9,
            probabilities: { change_request: 0.041, investigation: 0.04, question: 0.9, unclear: 0.04 },
          },
          options,
          "test",
        );
      },
      /inconsistent/,
    );
  });

  test("choice must be equal to or within 1e-6 of the maximum probability", () => {
    // Valid: choice matches max probability
    assert.doesNotThrow(() => {
      checkChoiceAnswer(
        {
          type: "choice",
          choice: "question",
          confidence: 0.7,
          probabilities: { change_request: 0.1, investigation: 0.1, question: 0.7, unclear: 0.1 },
        },
        options,
        "test",
      );
    });

    // Invalid: choice has lower probability than another option
    assert.throws(
      () => {
        checkChoiceAnswer(
          {
            type: "choice",
            choice: "question",
            confidence: 0.4,
            probabilities: { change_request: 0.5, investigation: 0.05, question: 0.4, unclear: 0.05 },
          },
          options,
          "test",
        );
      },
      /inconsistent/,
    );
  });

  test("rejects NaN, Infinity, negative probabilities, and prototype pollution", () => {
    const badValues = [NaN, Infinity, -0.01, 1.5, "0.5", null, undefined];
    for (const bad of badValues) {
      assert.throws(() => {
        checkChoiceAnswer(
          {
            type: "choice",
            choice: "question",
            confidence: bad,
            probabilities: { change_request: 0.1, investigation: 0.1, question: 0.7, unclear: 0.1 },
          },
          options,
          "test",
        );
      });
    }

    // Missing key
    assert.throws(() => {
      checkChoiceAnswer(
        {
          type: "choice",
          choice: "question",
          confidence: 0.7,
          probabilities: { change_request: 0.2, question: 0.8 },
        },
        options,
        "test",
      );
    });

    // Object with __proto__ pollution attempt should be rejected
    const evil = JSON.parse('{"change_request":0.1,"investigation":0.1,"question":0.7,"unclear":0.1,"__proto__":{"admin":true}}');
    assert.throws(() => {
      checkChoiceAnswer(
        {
          type: "choice",
          choice: "question",
          confidence: 0.7,
          probabilities: evil,
        },
        options,
        "test",
      );
    });
  });

  test("splitNoul boundary partitions", () => {
    assert.equal(splitNoul(0.70).verdict, "yes");
    assert.equal(splitNoul(0.70001).verdict, "yes");
    assert.equal(splitNoul(0.69999).verdict, "uncertain");
    assert.equal(splitNoul(0.50).verdict, "uncertain");
    assert.equal(splitNoul(0.30001).verdict, "uncertain");
    assert.equal(splitNoul(0.30).verdict, "no");
    assert.equal(splitNoul(0.29999).verdict, "no");

    assert.throws(() => splitNoul(-0.1), RangeError);
    assert.throws(() => splitNoul(1.1), RangeError);
    assert.throws(() => splitNoul(0.5, { high: 0.3, low: 0.7 }), RangeError);
  });

  test("checkScoreAnswer parses both array and object probabilities", () => {
    const criteria = BLAST_RADIUS_CRITERIA;
    const arrayValid = {
      type: "score",
      score: 1.5,
      confidence: 0.8,
      probabilities: [0.1, 0.4, 0.4, 0.1],
    };
    assert.doesNotThrow(() => checkScoreAnswer(arrayValid, criteria, "score-array"));

    const objValid = {
      type: "score",
      score: 1.5,
      confidence: 0.8,
      probabilities: { 0: 0.1, 1: 0.4, 2: 0.4, 3: 0.1 },
    };
    assert.doesNotThrow(() => checkScoreAnswer(objValid, criteria, "score-obj"));
  });
});

describe("Loop C: Prompt Injection Security Guardrail Containment", () => {
  const req = buildSelectionRequest("Perform migration", "jev-fast", defaultRegistry, { includeGuardrails: true });
  const baseAnswers = {
    workflow: {
      type: "choice",
      choice: "implement",
      confidence: 0.9,
      probabilities: { ...Object.fromEntries(Object.keys(req.questions.workflow.criteria).map((k) => [k, 0])), implement: 0.9, none: 0.1 },
    },
    agent: {
      type: "choice",
      choice: "implementer",
      confidence: 0.9,
      probabilities: { ...Object.fromEntries(Object.keys(req.questions.agent.criteria).map((k) => [k, 0])), implementer: 0.9, none: 0.1 },
    },
    skill: {
      type: "choice",
      choice: "none",
      confidence: 0.9,
      probabilities: { ...Object.fromEntries(Object.keys(req.questions.skill.criteria).map((k) => [k, 0])), none: 1.0 },
    },
    blast_radius: {
      type: "score",
      score: 1.0,
      confidence: 0.8,
      probabilities: [0.2, 0.6, 0.1, 0.1],
    },
    tag_secrets_auth: { type: "noul", noul: 0.1 },
    tag_ci_control_plane: { type: "noul", noul: 0.1 },
    tag_dependencies: { type: "noul", noul: 0.1 },
  };

  test("prompt_injection probability >= 0.70 forces security escalation", () => {
    for (const prob of [0.70, 0.75, 0.85, 0.99, 1.0]) {
      const response = {
        model: "jev-fast",
        answers: {
          ...baseAnswers,
          prompt_injection: { type: "noul", noul: prob },
        },
      };
      const advice = interpretSelectionResponse(response, req);
      assert.equal(advice.disposition, "escalate_security");
      const out = synthesizeIntakeContract("Perform migration", advice, { contracts });
      assert.equal(out.kind, "escalation");
      assert.equal(out.contract.severity, "high");
      assert.equal(out.contract.reason, "security_concern");
      assert.equal(contracts.validate(out.contract).ok, true);
    }
  });

  test("prompt_injection uncertain probability (0.31 to 0.69) forces security escalation", () => {
    for (const prob of [0.31, 0.40, 0.50, 0.60, 0.69]) {
      const response = {
        model: "jev-fast",
        answers: {
          ...baseAnswers,
          prompt_injection: { type: "noul", noul: prob },
        },
      };
      const advice = interpretSelectionResponse(response, req);
      assert.equal(advice.disposition, "escalate_security");
      const out = synthesizeIntakeContract("Perform migration", advice, { contracts });
      assert.equal(out.kind, "escalation");
      assert.equal(out.contract.severity, "high");
    }
  });

  test("prompt_injection probability <= 0.30 permits human_review", () => {
    for (const prob of [0.0, 0.10, 0.20, 0.30]) {
      const response = {
        model: "jev-fast",
        answers: {
          ...baseAnswers,
          prompt_injection: { type: "noul", noul: prob },
        },
      };
      const advice = interpretSelectionResponse(response, req);
      assert.equal(advice.disposition, "human_review");
      const out = synthesizeIntakeContract("Perform migration", advice, { contracts });
      assert.equal(out.kind, "task");
    }
  });
});

describe("Loop D: Spending Ledger & Cap Boundaries", () => {
  test("exact spending cap boundary ($2.00)", (t) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ledger-test-"));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    const ledgerFile = path.join(dir, "jev-ledger.json");

    // $1.999 is under $2.00
    fs.writeFileSync(ledgerFile, JSON.stringify({
      date: new Date().toISOString().slice(0, 10),
      daily_cap_usd: 2.0,
      total_spent_usd: 1.999,
      total_input_tokens: 1000,
      calls: 1,
    }));
    assert.doesNotThrow(() => checkSpendingCap({ ledgerPath: ledgerFile, dailyCapUsd: 2.0 }));

    // $2.000 is at cap -> throws
    fs.writeFileSync(ledgerFile, JSON.stringify({
      date: new Date().toISOString().slice(0, 10),
      daily_cap_usd: 2.0,
      total_spent_usd: 2.000,
      total_input_tokens: 1000,
      calls: 1,
    }));
    assert.throws(() => checkSpendingCap({ ledgerPath: ledgerFile, dailyCapUsd: 2.0 }), /spending cap reached/);

    // $2.001 is above cap -> throws
    fs.writeFileSync(ledgerFile, JSON.stringify({
      date: new Date().toISOString().slice(0, 10),
      daily_cap_usd: 2.0,
      total_spent_usd: 2.001,
      total_input_tokens: 1000,
      calls: 1,
    }));
    assert.throws(() => checkSpendingCap({ ledgerPath: ledgerFile, dailyCapUsd: 2.0 }), /spending cap reached/);
  });

  test("corrupted ledger file throws manual review required error", (t) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ledger-corrupt-"));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    const ledgerFile = path.join(dir, "jev-ledger.json");
    fs.writeFileSync(ledgerFile, "{ invalid json content");
    assert.throws(() => loadJevLedger({ ledgerPath: ledgerFile }), /corrupted/);
  });

  test("midnight UTC date rollover resets daily spend to 0", (t) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ledger-rollover-"));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    const ledgerFile = path.join(dir, "jev-ledger.json");

    // Yesterday's ledger was at max cap
    fs.writeFileSync(ledgerFile, JSON.stringify({
      date: "2026-10-25",
      daily_cap_usd: 2.0,
      total_spent_usd: 2.0,
      total_input_tokens: 1000000,
      calls: 10,
    }));

    // Loading for today's date resets total_spent_usd to 0
    const today = "2026-10-26";
    const ledger = loadJevLedger({ ledgerPath: ledgerFile, dateStr: today, dailyCapUsd: 2.0 });
    assert.equal(ledger.date, today);
    assert.equal(ledger.total_spent_usd, 0);
    assert.equal(ledger.calls, 0);
  });

  test("recordJevUsage accumulates correctly and updates atomically", (t) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ledger-atomic-"));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    const ledgerFile = path.join(dir, "jev-ledger.json");

    const today = new Date().toISOString().slice(0, 10);
    recordJevUsage({ input_tokens: 1_000_000, output_tokens: 0 }, {
      ledgerPath: ledgerFile,
      dateStr: today,
    });
    let ledger = loadJevLedger({ ledgerPath: ledgerFile, dateStr: today });
    assert.equal(ledger.calls, 1);
    assert.equal(ledger.total_input_tokens, 1_000_000);
    assert.equal(ledger.total_spent_usd, 0.042); // $0.042 per 1M tokens

    // Second call
    recordJevUsage({ input_tokens: 500_000, output_tokens: 10 }, {
      ledgerPath: ledgerFile,
      dateStr: today,
    });
    ledger = loadJevLedger({ ledgerPath: ledgerFile, dateStr: today });
    assert.equal(ledger.calls, 2);
    assert.equal(ledger.total_input_tokens, 1_500_000);
    assert.equal(ledger.total_spent_usd, 0.063);
  });
});
