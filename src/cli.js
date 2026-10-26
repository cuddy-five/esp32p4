#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { ContractRegistry, validateFile } from "./lib/contracts.js";
import { GitHubClient, resolveRepo } from "./lib/github.js";
import { checkPolicies, requiredHumanStages } from "./lib/orchestration.js";
import { applyAll, exportResource, planAll, RESOURCE_NAMES, selectResources } from "./lib/settings/index.js";
import {
  formatAnnotations,
  formatPlanMarkdown,
  formatPlanText,
  formatTriageMarkdown,
  writeStepSummary,
} from "./lib/report.js";
import { requestJev } from "./jev.js";
import { buildSelectionRequest, interpretSelectionResponse } from "./selection.js";
import { synthesizeIntakeContract } from "./triage.js";
import { buildEvidenceContract } from "./evidence.js";

export const EXIT = Object.freeze({ OK: 0, ERROR: 1, FAILED: 2 });

const USAGE = `control-plane <command> [options]

Commands
  validate <file...>           Validate contract documents against their schemas
    --kind <kind>              Force a contract kind instead of reading "contract"
    --format text|json         Output format (default: text)
    --annotations              Also emit GitHub Actions ::error annotations

  schema list                  List known contract kinds
  schema show <kind>           Print a contract schema

  policy check                 Validate orchestration/state-machine.yaml and
                               policies/approvals.yaml against the contracts
  policy stages --risk <level> [--tag t]... [--path p]...
                               Show which stages require a human for a task

  triage --yes [--model <name>] [--issue <num>] [--output <file>] <request>
                               Route a request with Jev and emit a validated
                               task or escalation contract

  evidence --task <file> --sha <sha> [--path <p>]... [--output <file>]
                               Build and validate an evidence contract and
                               evaluate within_scope and within_budget gates

  settings plan                Show what would change to reach desired state
  settings check               Like plan, exit 2 when drift exists
  settings apply --yes         Reconcile the repository to desired state
  settings export <resource>   Print live state in desired-file format
    --repo <owner/name>        Target repository (default: GH_REPO, GITHUB_REPOSITORY, origin)
    --only <a,b>               Restrict to resources: ${RESOURCE_NAMES.join(", ")}
    --format text|json|markdown
    --verbose                  Include unchanged items
    --summary                  Append Markdown to $GITHUB_STEP_SUMMARY when set

Exit codes
  0  success / no drift        1  usage or runtime error        2  validation failed or drift detected
`;

/**
 * @param {string[]} argv
 * @param {{
 *   stdout?: (s: string) => void,
 *   stderr?: (s: string) => void,
 *   env?: NodeJS.ProcessEnv,
 *   client?: GitHubClient,
 *   jevFetch?: typeof fetch,
 * }} [io]
 * @returns {Promise<number>} exit code
 */
export async function main(argv, io = {}) {
  const stdout = io.stdout ?? ((s) => process.stdout.write(`${s}\n`));
  const stderr = io.stderr ?? ((s) => process.stderr.write(`${s}\n`));
  const env = io.env ?? process.env;

  const [command, ...rest] = argv;
  try {
    switch (command) {
      case "validate":
        return cmdValidate(rest, { stdout, stderr });
      case "schema":
        return cmdSchema(rest, { stdout, stderr });
      case "settings":
        return await cmdSettings(rest, { stdout, stderr, env, client: io.client });
      case "policy":
        return cmdPolicy(rest, { stdout, stderr });
      case "triage":
        return await cmdTriage(rest, { stdout, stderr, env, fetchImpl: io.jevFetch });
      case "evidence":
        return cmdEvidence(rest, { stdout, stderr });
      case undefined:
      case "help":
      case "--help":
      case "-h":
        stdout(USAGE);
        return EXIT.OK;
      default:
        stderr(`unknown command "${command}"\n\n${USAGE}`);
        return EXIT.ERROR;
    }
  } catch (err) {
    stderr(`error: ${err.message}`);
    if (env.CONTROL_PLANE_DEBUG) stderr(err.stack ?? "");
    return EXIT.ERROR;
  }
}

function cmdValidate(args, { stdout, stderr }) {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      kind: { type: "string" },
      format: { type: "string", default: "text" },
      annotations: { type: "boolean", default: false },
    },
  });
  if (positionals.length === 0) {
    stderr("validate: at least one file is required");
    return EXIT.ERROR;
  }
  const registry = new ContractRegistry();
  const results = positionals.map((file) => validateFile(registry, file, { kind: values.kind }));
  const failed = results.filter((r) => !r.ok);

  if (values.format === "json") {
    stdout(JSON.stringify({ ok: failed.length === 0, results }, null, 2));
  } else {
    for (const r of results) {
      if (r.ok) {
        stdout(`ok ${r.file} (${r.kind})`);
      } else {
        stdout(`FAIL ${r.file}${r.kind ? ` (${r.kind})` : ""}`);
        for (const e of r.errors) stdout(`  ${e.path}: ${e.message}`);
      }
    }
    stdout(`${results.length - failed.length}/${results.length} documents valid`);
  }
  if (values.annotations) {
    for (const r of failed) for (const line of formatAnnotations(r)) stdout(line);
  }
  return failed.length === 0 ? EXIT.OK : EXIT.FAILED;
}

function cmdSchema(args, { stdout, stderr }) {
  const [sub, kind] = args;
  const registry = new ContractRegistry();
  if (sub === "list") {
    for (const k of registry.list()) stdout(k);
    return EXIT.OK;
  }
  if (sub === "show") {
    if (!kind) {
      stderr("schema show: contract kind is required");
      return EXIT.ERROR;
    }
    stdout(JSON.stringify(registry.schemaFor(kind), null, 2));
    return EXIT.OK;
  }
  stderr(`schema: unknown subcommand "${sub ?? ""}" (expected list or show)`);
  return EXIT.ERROR;
}

function cmdPolicy(args, { stdout, stderr }) {
  const [sub, ...subArgs] = args;
  if (sub === "check") {
    const { values } = parseArgs({ args: subArgs, options: { format: { type: "string", default: "text" } } });
    const { problems, stateMachine, approvals } = checkPolicies();
    if (values.format === "json") {
      stdout(JSON.stringify({ ok: problems.length === 0, problems }, null, 2));
    } else {
      for (const p of problems) stdout(`FAIL ${path.relative(process.cwd(), p.file)}${p.path}: ${p.message}`);
      const nStates = Object.keys(stateMachine.states).length;
      const nTransitions = stateMachine.transitions.length;
      const nGates = Object.keys(stateMachine.gates).length;
      const implemented = Object.values(stateMachine.gates).filter((g) => g.status === "implemented").length;
      stdout(
        `state machine: ${nStates} states, ${nTransitions} transition rules, ${nGates} gates (${implemented} implemented)`,
      );
      stdout(`approvals: ${Object.keys(approvals.by_risk).length} risk levels, ${approvals.always_human.length} always-human rules`);
      stdout(problems.length === 0 ? "policy: ok" : `policy: ${problems.length} problem${problems.length === 1 ? "" : "s"}`);
    }
    return problems.length === 0 ? EXIT.OK : EXIT.FAILED;
  }
  if (sub === "stages") {
    const { values } = parseArgs({
      args: subArgs,
      options: {
        risk: { type: "string" },
        tag: { type: "string", multiple: true, default: [] },
        path: { type: "string", multiple: true, default: [] },
        format: { type: "string", default: "text" },
      },
    });
    if (!values.risk) {
      stderr("policy stages: --risk <low|medium|high|critical> is required");
      return EXIT.ERROR;
    }
    const { approvals } = checkPolicies();
    if (!approvals.by_risk[values.risk]) {
      stderr(`policy stages: unknown risk level "${values.risk}"`);
      return EXIT.ERROR;
    }
    const out = requiredHumanStages(approvals, { risk: { level: values.risk, tags: values.tag }, paths: values.path });
    if (values.format === "json") {
      stdout(JSON.stringify(out, null, 2));
    } else if (out.stages.length === 0) {
      stdout("no human approval required; the adversarial loop is the control");
    } else {
      stdout(`human approval required at: ${out.stages.join(", ")}`);
      stdout(`because: ${out.reasons.join(", ")}`);
    }
    return EXIT.OK;
  }
  stderr(`policy: unknown subcommand "${sub ?? ""}" (expected check or stages)`);
  return EXIT.ERROR;
}

function resolveTypesafeKey(env) {
  if (env.TYPESAFE_API_KEY?.trim()) return env.TYPESAFE_API_KEY.trim();
  const keyPath = path.join(os.homedir(), ".config", "esp32p4", "jev-api-key");
  let fd;
  try {
    fd = fs.openSync(keyPath, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    const info = fs.fstatSync(fd);
    if (!info.isFile() || (info.mode & 0o077) !== 0 || info.uid !== process.getuid() || info.size > 4096) {
      throw new Error("Invalid private key file.");
    }
    const key = fs.readFileSync(fd, "utf8").trim();
    if (!key || /\s/.test(key)) throw new Error("Invalid key format.");
    return key;
  } catch {
    throw new Error("Provide TYPESAFE_API_KEY or an owner-only ~/.config/esp32p4/jev-api-key file (mode 600).");
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

async function cmdTriage(args, { stdout, stderr, env, fetchImpl }) {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      yes: { type: "boolean", default: false },
      model: { type: "string" },
      issue: { type: "string" },
      "requested-by": { type: "string", default: "human" },
      output: { type: "string" },
      format: { type: "string", default: "json" },
      summary: { type: "boolean", default: false },
    },
  });
  if (!values.yes) {
    stderr("triage: refusing to call Jev without --yes");
    return EXIT.ERROR;
  }
  const text = positionals.join(" ").trim();
  if (!text) {
    stderr("triage: request text is required");
    return EXIT.ERROR;
  }
  const model = values.model ?? env.TYPESAFE_MODEL ?? "jev-latest";
  const issueNumber = values.issue ? Number.parseInt(values.issue, 10) : undefined;
  if (values.issue && (!Number.isInteger(issueNumber) || issueNumber < 1)) {
    stderr(`triage: invalid --issue "${values.issue}"`);
    return EXIT.ERROR;
  }

  const request = buildSelectionRequest(text, model, undefined, { includeGuardrails: true });
  const response = await requestJev(request, {
    apiKey: resolveTypesafeKey(env),
    ...(fetchImpl ? { fetchImpl } : {}),
  });
  const advice = interpretSelectionResponse(response, request);
  const synthesized = synthesizeIntakeContract(text, advice, {
    issueNumber,
    requestedBy: values["requested-by"],
  });
  const full = { advice, ...synthesized };

  if (values.output) {
    fs.writeFileSync(values.output, `${JSON.stringify(synthesized.contract, null, 2)}\n`, "utf8");
  }
  if (values.summary) {
    writeStepSummary(formatTriageMarkdown(full), env);
  }
  if (values.format === "markdown") {
    stdout(formatTriageMarkdown(full));
  } else {
    stdout(JSON.stringify(full, null, 2));
  }
  return EXIT.OK;
}

function cmdEvidence(args, { stdout, stderr }) {
  const { values } = parseArgs({
    args,
    options: {
      task: { type: "string" },
      sha: { type: "string" },
      "base-sha": { type: "string" },
      path: { type: "string", multiple: true, default: [] },
      "files-changed": { type: "string" },
      additions: { type: "string", default: "0" },
      deletions: { type: "string", default: "0" },
      "tokens-used": { type: "string" },
      output: { type: "string" },
      format: { type: "string", default: "json" },
    },
  });
  if (!values.task || !values.sha) {
    stderr("evidence: --task <file> and --sha <40-hex-sha> are required");
    return EXIT.ERROR;
  }
  const task = JSON.parse(fs.readFileSync(values.task, "utf8"));
  const additions = Number.parseInt(values.additions, 10) || 0;
  const deletions = Number.parseInt(values.deletions, 10) || 0;
  const filesChanged = values["files-changed"]
    ? Number.parseInt(values["files-changed"], 10)
    : values.path.length;
  const budgetUsed = values["tokens-used"]
    ? { tokens: Number.parseInt(values["tokens-used"], 10) }
    : undefined;

  const result = buildEvidenceContract(task, {
    sha: values.sha,
    baseSha: values["base-sha"],
    paths: values.path,
    filesChanged,
    additions,
    deletions,
    budgetUsed,
  });

  if (values.output) {
    fs.writeFileSync(values.output, `${JSON.stringify(result.evidence, null, 2)}\n`, "utf8");
  }
  stdout(JSON.stringify(result, null, 2));
  return result.gates.within_scope && result.gates.within_budget ? EXIT.OK : EXIT.FAILED;
}

async function cmdSettings(args, { stdout, stderr, env, client: injectedClient }) {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      repo: { type: "string" },
      only: { type: "string" },
      format: { type: "string", default: "text" },
      verbose: { type: "boolean", default: false },
      summary: { type: "boolean", default: false },
      yes: { type: "boolean", default: false },
    },
  });
  const [sub, ...subArgs] = positionals;
  if (!["plan", "check", "apply", "export"].includes(sub)) {
    stderr(`settings: unknown subcommand "${sub ?? ""}" (expected plan, check, apply, or export)`);
    return EXIT.ERROR;
  }
  if (!["text", "json", "markdown"].includes(values.format)) {
    stderr(`settings: unknown format "${values.format}"`);
    return EXIT.ERROR;
  }

  const only = values.only ? values.only.split(",").map((s) => s.trim()).filter(Boolean) : undefined;
  selectResources(only);
  const repo = resolveRepo(values.repo, { env });
  const client = injectedClient ?? new GitHubClient();

  if (sub === "export") {
    const resource = subArgs[0];
    if (!resource) {
      stderr(`settings export: resource is required (${RESOURCE_NAMES.join(", ")})`);
      return EXIT.ERROR;
    }
    const desired = await exportResource({ client, repo, resource });
    stdout(JSON.stringify(desired, null, 2));
    return EXIT.OK;
  }

  if (sub === "apply" && !values.yes) {
    stderr("settings apply: refusing to mutate repository settings without --yes");
    return EXIT.ERROR;
  }

  const report = sub === "apply" ? await applyAll({ client, repo, only }) : await planAll({ client, repo, only });

  const title = sub === "apply" ? "Settings applied" : "Settings plan";
  if (values.format === "json") {
    stdout(JSON.stringify(report, null, 2));
  } else if (values.format === "markdown") {
    stdout(formatPlanMarkdown(report, { title }));
  } else {
    stdout(formatPlanText(report, { verbose: values.verbose }));
    if (sub === "apply") {
      const n = report.applied.reduce((acc, r) => acc + r.results.filter((x) => x.status === "applied").length, 0);
      stdout(`applied ${n} change${n === 1 ? "" : "s"}`);
    }
  }
  if (values.summary) writeStepSummary(formatPlanMarkdown(report, { title }), env);

  if (sub === "check" && report.drift) return EXIT.FAILED;
  return EXIT.OK;
}

function invokedDirectly() {
  if (!process.argv[1]) return false;
  try {
    return import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href;
  } catch {
    return false;
  }
}

if (invokedDirectly()) {
  main(process.argv.slice(2)).then((code) => {
    process.exitCode = code;
  });
}