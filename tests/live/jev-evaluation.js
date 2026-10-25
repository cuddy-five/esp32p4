/*
 * ELI5: This is a small practice sheet for Jev's real sorting behavior.
 * Each row has a request and the tray we expect it to choose. The script
 * calls the same runner you can use by hand, so it exercises the real path.
 * It is outside npm test because it sends text to TypeSafe and may cost money.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "../..");
const cases = JSON.parse(fs.readFileSync(path.join(here, "jev-cases.json"), "utf8"));
const usage = 'Usage: npm run evaluate:jev -- --yes [--model NAME] [--case ID]';

/*
 * ELI5: Parse the switches before making any internet calls.
 * --yes is the clear permission switch. --case lets you try one row first,
 * which limits cost and helps you learn what one returned answer means.
 */
function readOptions(args) {
  let confirmed = false;
  let model = process.env.TYPESAFE_MODEL;
  let onlyCase;
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === "--yes" && !confirmed) confirmed = true;
    else if (args[index] === "--model" && args[index + 1] && !args[index + 1].startsWith("--")) {
      model = args[index + 1];
      index += 1;
    } else if (args[index] === "--case" && args[index + 1] && !args[index + 1].startsWith("--")) {
      onlyCase = args[index + 1];
      index += 1;
    } else {
      throw new Error(usage);
    }
  }
  if (!confirmed) throw new Error(`A live evaluation requires --yes. ${usage}`);
  if (!model?.trim()) throw new Error(`Choose a model with --model or TYPESAFE_MODEL. ${usage}`);
  const selected = onlyCase ? cases.filter((item) => item.id === onlyCase) : cases;
  if (selected.length === 0) throw new Error(`Unknown case "${onlyCase}". Choose: ${cases.map((item) => item.id).join(", ")}`);
  return { model: model.trim(), selected };
}

/*
 * ELI5: One child process runs the existing Jev command for one row.
 * That reuses its private key lookup, timeout, size limits and answer checks.
 * The key stays out of this script and out of command-line arguments.
 */
function evaluateOne(item, model) {
  const result = spawnSync(process.execPath, [
    path.join(repo, "src/run-jev.js"), "--yes", "--model", model, item.request,
  ], {
    cwd: repo,
    encoding: "utf8",
    timeout: 25000,
    maxBuffer: 64 * 1024,
  });
  if (result.error) throw new Error(`${item.id}: runner failed (${result.error.message})`);
  if (result.status !== 0) {
    const safeMessage = result.stderr.trim() || `runner exited ${result.status}`;
    throw new Error(`${item.id}: ${safeMessage}`);
  }
  let advice;
  try {
    advice = JSON.parse(result.stdout);
  } catch {
    throw new Error(`${item.id}: runner did not return readable JSON.`);
  }
  return {
    id: item.id,
    expected: item.expected,
    actual: advice.choice,
    match: item.expected === advice.choice,
    confidence: advice.confidence,
    resolved_model: advice.resolved_model,
    usage: advice.usage,
  };
}

try {
  const { model, selected } = readOptions(process.argv.slice(2));
  console.log(`Running ${selected.length} live Jev example(s) with ${model}.`);
  console.log("Requests go to TypeSafe. No task is created and no GitHub action runs.");
  const results = selected.map((item) => evaluateOne(item, model));
  for (const result of results) {
    console.log(`${result.match ? "MATCH" : "MISMATCH"} ${result.id}: expected=${result.expected}, actual=${result.actual}, confidence=${result.confidence}`);
    console.log(`  resolved model=${result.resolved_model}; usage=${result.usage.input_tokens} input + ${result.usage.output_tokens} output tokens`);
  }
  const matches = results.filter((result) => result.match).length;
  console.log(`Result: ${matches}/${results.length} matched. This small sample is a smoke check, not calibration.`);
  process.exitCode = matches === results.length ? 0 : 1;
} catch (error) {
  console.error(error.message);
  process.exitCode = 2;
}
