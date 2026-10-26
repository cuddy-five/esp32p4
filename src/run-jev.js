/*
 * Entry point: connect routing's question sheet to Jev's telephone.
 * To make a REAL call from the repository root:
 *   node src/run-jev.js --yes --model YOUR_MODEL "Find why the build fails."
 * Add --select to pick a registered workflow, agent and skill instead of an
 * intent (options come from the enabled .agents/.workflows/.skills registries).
 * Add --guardrails to include parallel Noul/Score risk and injection checks.
 * Add --contract to synthesize a schema-validated `task` or `escalation` contract.
 */
import { buildIntakeRequest, interpretIntakeResponse } from "./routing.js";
import { buildSelectionRequest, interpretSelectionResponse } from "./selection.js";
import { synthesizeIntakeContract } from "./triage.js";
import { requestJev } from "./jev.js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const usage =
  'Usage: node src/run-jev.js --yes [--select] [--guardrails] [--contract] [--model NAME] "request text"';

function loadApiKey() {
  if (process.env.TYPESAFE_API_KEY?.trim()) return process.env.TYPESAFE_API_KEY.trim();
  const keyPath = path.join(os.homedir(), ".config", "esp32p4", "jev-api-key");
  let fd;
  try {
    fd = fs.openSync(keyPath, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    const info = fs.fstatSync(fd);
    if (
      !info.isFile() ||
      (info.mode & 0o077) !== 0 ||
      info.uid !== process.getuid() ||
      info.size > 4096
    ) {
      throw new Error("Invalid private key file.");
    }
    const key = fs.readFileSync(fd, "utf8").trim();
    if (!key || /\s/.test(key)) throw new Error("Invalid key format.");
    return key;
  } catch {
    throw new Error(
      "Provide TYPESAFE_API_KEY or an owner-only ~/.config/esp32p4/jev-api-key file (mode 600).",
    );
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === "--help") {
    console.log(
      `${usage}\nRequires --model or TYPESAFE_MODEL. Key: TYPESAFE_API_KEY or ~/.config/esp32p4/jev-api-key.`,
    );
    return 0;
  }
  let model = process.env.TYPESAFE_MODEL;
  let confirmed = false;
  let select = false;
  let guardrails = false;
  let contractMode = false;
  let text;
  let request;
  try {
    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      if (arg === "--yes" && !confirmed) confirmed = true;
      else if (arg === "--select" && !select) select = true;
      else if (arg === "--guardrails" && !guardrails) guardrails = true;
      else if (arg === "--contract" && !contractMode) {
        contractMode = true;
        select = true;
        guardrails = true;
      } else if (arg === "--model" && args[i + 1] && !args[i + 1].startsWith("--")) {
        model = args[++i];
      } else if (!arg.startsWith("--") && text === undefined) text = arg;
      else throw new Error(usage);
    }
    if (!confirmed) throw new Error(`A live call requires --yes. ${usage}`);
    request = select
      ? buildSelectionRequest(text, model, undefined, { includeGuardrails: guardrails })
      : buildIntakeRequest(text, model, { includeGuardrails: guardrails });
  } catch (error) {
    console.error(error.message);
    return 2; // Repository convention: invalid input or invocation.
  }

  try {
    const response = await requestJev(request, { apiKey: loadApiKey() });
    const advice = select
      ? interpretSelectionResponse(response, request)
      : interpretIntakeResponse(response, request);

    if (contractMode) {
      const synthesized = synthesizeIntakeContract(text, advice);
      console.log(JSON.stringify({ advice, ...synthesized }, null, 2));
      return 0;
    }
    console.log(JSON.stringify(advice, null, 2));
    return 0;
  } catch (error) {
    console.error(error.message);
    return 1; // Operational failure; use manual intake.
  }
}

process.exitCode = await main();