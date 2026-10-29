#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { ContractRegistry, validateFile } from "./lib/contracts.js";
import { GitHubClient, resolveRepo } from "./lib/github.js";
import { checkPolicies, requiredHumanStages } from "./lib/orchestration.js";
import { CONTRACTS_DIR, resolveProjectPaths } from "./lib/paths.js";
import { applyAll, exportResource, planAll, RESOURCE_NAMES, selectResources } from "./lib/settings/index.js";
import {
  formatAnnotations,
  formatEvidenceMarkdown,
  formatPlanMarkdown,
  formatPlanText,
  writeStepSummary,
} from "./lib/report.js";
import { loadReviewDomains } from "./review-domains.js";
import { buildEvidenceContract } from "./evidence.js";
import { compactLogs } from "./compaction.js";

export const EXIT = Object.freeze({ OK: 0, ERROR: 1, FAILED: 2 });

const USAGE = `control-plane <command> [options]

Commands
  validate <file...>           Validate contract documents against their schemas
    --kind <kind>              Force a contract kind instead of reading "contract"
    --format text|json         Output format (default: text)
    --annotations              Also emit GitHub Actions ::error annotations

  schema list                  List known contract kinds
  schema show <kind>           Print a contract schema

  policy check [--project <dir>]
                               Validate orchestration/state-machine.yaml and
                               policies/approvals.yaml against the contracts
  policy stages --risk <level> [--project <dir>] [--tag t]... [--path p]...
                               Show which stages require a human for a task

  evidence --task <file> --sha <sha> [--project <dir>] [--path <p>]... [--output <file>]
                               Build and validate an evidence contract and
                               report scope, budget and review-domain mapping
    --format json|markdown     Output format (default: json reporting envelope)
    --summary                  Append Markdown to $GITHUB_STEP_SUMMARY when set
    --output <file>            Save only the standalone evidence contract

  compact [--file <file>] [--max-chars <n>] [--offline] [--format text|json] [--output <file>]
                               Compact execution/test logs using deterministic local scoring

  settings plan [--project <dir>]
                               Show what would change to reach desired state
  settings check [--project <dir>]
                               Like plan, exit 2 when drift exists
  settings apply --yes [--project <dir>]
                               Reconcile the repository to desired state
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
      case "evidence":
        return cmdEvidence(rest, { stdout, stderr, env });
      case "compact":
        return await cmdCompact(rest, { stdout, stderr, stdin: io.stdin });
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
    const { values } = parseArgs({
      args: subArgs,
      options: {
        project: { type: "string" },
        format: { type: "string", default: "text" },
      },
    });
    let paths;
    try {
      paths = resolveProjectPaths(values.project);
    } catch (err) {
      stderr(`policy check: ${err.message}`);
      return EXIT.ERROR;
    }
    if (paths.isExplicit) {
      if (!fs.existsSync(paths.stateMachineFile)) {
        stderr(`policy check: state machine not found at "${paths.stateMachineFile}"`);
        return EXIT.ERROR;
      }
      if (!fs.existsSync(paths.approvalsFile)) {
        stderr(`policy check: approvals policy not found at "${paths.approvalsFile}"`);
        return EXIT.ERROR;
      }
    }
    const { problems, stateMachine, approvals } = checkPolicies({
      stateMachineFile: paths.stateMachineFile,
      approvalsFile: paths.approvalsFile,
      contractsDir: CONTRACTS_DIR,
    });
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
        project: { type: "string" },
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
    let paths;
    try {
      paths = resolveProjectPaths(values.project);
    } catch (err) {
      stderr(`policy stages: ${err.message}`);
      return EXIT.ERROR;
    }
    if (paths.isExplicit && !fs.existsSync(paths.approvalsFile)) {
      stderr(`policy stages: approvals policy not found at "${paths.approvalsFile}"`);
      return EXIT.ERROR;
    }
    const { approvals } = checkPolicies({
      stateMachineFile: paths.stateMachineFile,
      approvalsFile: paths.approvalsFile,
      contractsDir: CONTRACTS_DIR,
    });
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

function cmdEvidence(args, { stdout, stderr, env }) {
  const { values } = parseArgs({
    args,
    options: {
      project: { type: "string" },
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
      summary: { type: "boolean", default: false },
    },
  });
  if (!["json", "markdown"].includes(values.format)) {
    stderr(`evidence: unknown format "${values.format}"`);
    return EXIT.ERROR;
  }
  if (!values.task || !values.sha) {
    stderr("evidence: --task <file> and --sha <40-hex-sha> are required");
    return EXIT.ERROR;
  }

  let projectPaths;
  try {
    projectPaths = resolveProjectPaths(values.project);
  } catch (err) {
    stderr(`evidence: ${err.message}`);
    return EXIT.ERROR;
  }

  let reviewDomains;
  if (projectPaths.isExplicit) {
    if (fs.existsSync(projectPaths.reviewDomainsFile)) {
      try {
        reviewDomains = loadReviewDomains(projectPaths.reviewDomainsFile);
      } catch (err) {
        stderr(`evidence: failed to load review domains at "${projectPaths.reviewDomainsFile}": ${err.message}`);
        return EXIT.ERROR;
      }
    } else {
      reviewDomains = { schema_version: 1, domains: [] };
    }
  }

  let task;
  try {
    task = JSON.parse(fs.readFileSync(values.task, "utf8"));
  } catch (err) {
    stderr(`evidence: cannot read task contract "${values.task}": ${err.message}`);
    return EXIT.ERROR;
  }
  const additions = Number.parseInt(values.additions, 10) || 0;
  const deletions = Number.parseInt(values.deletions, 10) || 0;
  const filesChanged = values["files-changed"]
    ? Number.parseInt(values["files-changed"], 10)
    : values.path.length;
  const budgetUsed = values["tokens-used"]
    ? { tokens: Number.parseInt(values["tokens-used"], 10) }
    : undefined;

  let result;
  try {
    result = buildEvidenceContract(task, {
      sha: values.sha,
      baseSha: values["base-sha"],
      paths: values.path,
      filesChanged,
      additions,
      deletions,
      budgetUsed,
      ...(reviewDomains ? { reviewDomains } : {}),
    });
  } catch (err) {
    stderr(`evidence: failed to build evidence contract: ${err.message}`);
    return EXIT.ERROR;
  }

  if (values.output) {
    fs.writeFileSync(values.output, `${JSON.stringify(result.evidence, null, 2)}\n`, "utf8");
  }
  const markdown = values.summary || values.format === "markdown" ? formatEvidenceMarkdown(result) : undefined;
  if (values.summary) writeStepSummary(markdown, env);
  stdout(values.format === "markdown" ? markdown : JSON.stringify(result, null, 2));
  return result.gates.within_scope && result.gates.within_budget ? EXIT.OK : EXIT.FAILED;
}

async function cmdCompact(args, { stdout, stderr, stdin }) {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      file: { type: "string" },
      "max-chars": { type: "string", default: "2000" },
      offline: { type: "boolean", default: false },
      format: { type: "string", default: "text" },
      output: { type: "string" },
    },
  });

  if (!["text", "json"].includes(values.format)) {
    stderr(`compact: unknown format "${values.format}" (expected text or json)`);
    return EXIT.ERROR;
  }

  const maxChars = Number.parseInt(values["max-chars"], 10);
  if (!Number.isFinite(maxChars) || maxChars <= 0) {
    stderr(`compact: invalid --max-chars "${values["max-chars"]}"`);
    return EXIT.ERROR;
  }

  let text = "";
  const targetFile = values.file ?? positionals[0];
  if (targetFile) {
    try {
      text = fs.readFileSync(targetFile, "utf8");
    } catch (err) {
      stderr(`compact: cannot read file "${targetFile}": ${err.message}`);
      return EXIT.ERROR;
    }
  } else if (stdin !== undefined) {
    text = typeof stdin === "string" ? stdin : await readStream(stdin);
  } else if (!process.stdin.isTTY) {
    text = await readStream(process.stdin);
  } else {
    stderr("compact: input file is required or pipe log into stdin");
    return EXIT.ERROR;
  }

  const result = await compactLogs(text, {
    maxChars,
    offline: values.offline,
  });

  if (values.output) {
    try {
      fs.writeFileSync(values.output, result.compacted, "utf8");
    } catch (err) {
      stderr(`compact: failed to write output file "${values.output}": ${err.message}`);
      return EXIT.ERROR;
    }
  }

  if (values.format === "json") {
    stdout(JSON.stringify(result, null, 2));
  } else {
    stdout(result.compacted);
  }

  return EXIT.OK;
}

async function readStream(stream) {
  if (typeof stream === "string") return stream;
  const MAX_STREAM_BYTES = 10 * 1024 * 1024; // 10 MiB
  const chunks = [];
  let totalBytes = 0;
  for await (const chunk of stream) {
    const buf = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
    totalBytes += buf.length;
    if (totalBytes > MAX_STREAM_BYTES) {
      throw new Error(`stream exceeded maximum threshold of ${MAX_STREAM_BYTES} bytes`);
    }
    chunks.push(buf);
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function cmdSettings(args, { stdout, stderr, env, client: injectedClient }) {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      project: { type: "string" },
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

  let paths;
  try {
    paths = resolveProjectPaths(values.project);
  } catch (err) {
    stderr(`settings: ${err.message}`);
    return EXIT.ERROR;
  }
  if (paths.isExplicit && !fs.existsSync(paths.settingsDir)) {
    stderr(`settings: consumer settings directory not found at "${paths.settingsDir}"`);
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

  const report = sub === "apply"
    ? await applyAll({ client, repo, only, settingsDir: paths.settingsDir })
    : await planAll({ client, repo, only, settingsDir: paths.settingsDir });

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
