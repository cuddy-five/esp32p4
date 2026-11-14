#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const REFERENCES = ".github/skills/device-references/references/";

// These are the complete input allowlist. Never accept a path from CLI input,
// scan the checkout, or include a source's contents in the packet.
const SOURCES = Object.freeze({
  project: ["PROJECT.md", "current purpose, owner decisions and implementation state"],
  guide: ["docs/runbooks/wallet-development.md", "build sequence, evidence limits and task checks"],
  task: ["docs/templates/wallet-task.md", "one bounded outcome, allowed files and acceptance checks"],
  domains: [".review-domains.json", "current task_required setting and required reviewers"],
  firmware: ["scripts/gates/firmware-check.sh", "actual firmware gate commands"],
  toolchain: ["firmware/rust-toolchain.toml", "compiler, components and cross-build target"],
  fork: [`${REFERENCES}fork-rules.md`, "pinned fork rules, vector provenance and uncovered cases"],
  standards: [`${REFERENCES}bitcoin-standards.md`, "primary BIP/RFC sources and vectors"],
  chip: [`${REFERENCES}chip-esp32-p4.md`, "silicon revision, errata, entropy and memory access"],
  board: [`${REFERENCES}board-waveshare-esp32-p4-wifi6-touch-lcd-3.5.md`, "board wiring, radio isolation and unknown hardware facts"],
  oracle: [".github/skills/device-references/scripts/unified_sighash_check.py", "independent hash checker; read its assumptions before use"],
  evidence: ["docs/runbooks/evidence-reporting.md", "record actual checks against the reviewed revision"],
});

const ROUTES = Object.freeze({
  signing: {
    sources: ["fork", "standards", "oracle"],
    focus: "Separate byte parsing, signature hashing and signing policy. A digest is not a signature or permission to sign.",
    stop: "Stop if allowed hash modes, amount/fee bounds, supported scripts or trusted spent-output data are unspecified. Compare with pinned independent vectors; do not generate the expected answer with the code under test.",
  },
  secrets: {
    sources: ["chip", "standards"],
    focus: "Trace entropy, derivation, secret ownership, memory placement and clearing on success, cancel, error and reset. Use public test material only.",
    stop: "Stop if entropy conditions, dependency suitability or secret lifetimes are unknown. Source claims and host tests do not prove physical entropy quality, memory isolation or erasure.",
  },
  hardware: {
    sources: ["board", "chip"],
    focus: "Match the physical board and silicon revision to pinned wiring and errata before choosing a driver or register map.",
    stop: "Stop on unverified pins, unproven camera driver support, power rails or revision compatibility. Require device measurements for board claims; a cross-build is not a boot test. Hardware rework, flashing and eFuse changes need their own owner authorization.",
  },
  interface: {
    sources: ["board", "standards", "fork"],
    focus: "Bound hostile input and bind displayed destination, amount, fee and signing mode to the exact transaction the user confirms. Test cancel, timeout and changed input.",
    stop: "Stop if the transport/QR format, parser limits or confirmation policy is undecided, or camera driver support is unproven. Never replace missing interoperability or device tests with a simulated success claim.",
  },
  integration: {
    sources: ["fork", "chip", "board", "evidence"],
    focus: "Integrate separately reviewed slices. Check the same revision through host tests, cross-build, device exercises and external interoperability; report each level separately.",
    stop: "Stop if required reviews, policy decisions, device evidence or recovery checks are missing. Successful CI is not approval to merge or use real funds.",
  },
});

export const TOPICS = Object.freeze(Object.keys(ROUTES));
const USAGE = `Usage: node scripts/wallet-context.js <topic>
Topics: ${TOPICS.join(", ")}

Print a small offline source/check map for one wallet task. Paths are relative
to this repository. The helper does not run checks, read source contents,
fetch references, start agents or grant approval.
Use --help or -h to print this help.`;

/** Check metadata only; refuse symlinks before following any path component. */
function checkSource(root, relative) {
  const parts = relative.split("/");
  let current = root;
  for (let i = 0; i < parts.length; i += 1) {
    current = path.join(current, parts[i]);
    let stat;
    try {
      stat = fs.lstatSync(current);
    } catch {
      throw new Error(`required source unavailable: ${relative}`);
    }
    if (stat.isSymbolicLink()) throw new Error(`symlinked source refused: ${relative}`);
    if (i < parts.length - 1 && !stat.isDirectory()) {
      throw new Error(`required source unavailable: ${relative}`);
    }
    if (i === parts.length - 1 && !stat.isFile()) {
      throw new Error(`source is not a regular file: ${relative}`);
    }
  }
}

/** root is injectable for tests only; the CLI always uses this script's repository. */
export function buildWalletContext(topic, root = ROOT) {
  if (!Object.hasOwn(ROUTES, topic)) throw new Error(`choose one topic: ${TOPICS.join(", ")}`);
  const route = ROUTES[topic];
  const sources = ["project", "guide", "task", "domains", ...route.sources, "firmware", "toolchain"];
  const resolvedRoot = fs.realpathSync(root);
  for (const name of sources) checkSource(resolvedRoot, SOURCES[name][0]);

  const lines = [
    `Wallet task context: ${topic}`,
    "Offline routing only. No checks have run; this is not approval or readiness evidence.",
    "",
    "Before editing: record the branch/revision, requested outcome, allowed files,",
    "acceptance checks and next responsible role. Check PR halt/review state when",
    "a PR exists. Read the current sources below; confirm their pins and open gaps.",
    "",
    "Read in order (repository-relative paths):",
    ...sources.map((name, i) => `  ${i + 1}. ${SOURCES[name][0]} — ${SOURCES[name][1]}`),
    "",
    `Focus: ${route.focus}`,
    `Stop conditions: ${route.stop}`,
    "",
    "Checks to select for the task, from the repository root (not executed here):",
    "  bash scripts/gates/firmware-check.sh",
    "    (owner's workstation: distrobox enter devbox -- bash scripts/gates/firmware-check.sh)",
  ];
  if (topic === "integration") {
    lines.push("  npm test", "  npm run validate:examples", "  node src/cli.js policy check");
  }
  lines.push(
    "  git diff --check",
    "Use the installed pinned toolchain. If it is missing, report the gap; do",
    "not trigger an unapproved install.",
    "The firmware gate checks formatting, lints, host tests and a cross-build.",
    "Add task-specific negative cases and independent expected results before code.",
    "",
    "Handoff: exact snapshot, changed behavior, checks actually run, remaining",
    "unknowns and next role. Keep review and verification independent; record the",
    "actual model family. The owner retains commits, publication and merges.",
  );
  return lines.join("\n");
}

export function main(args, io = {}) {
  const stdout = io.stdout ?? ((s) => process.stdout.write(`${s}\n`));
  const stderr = io.stderr ?? ((s) => process.stderr.write(`${s}\n`));
  if (args.length === 1 && ["--help", "-h"].includes(args[0])) {
    stdout(USAGE);
    return 0;
  }
  if (args.length !== 1 || !TOPICS.includes(args[0])) {
    stderr(USAGE);
    return 1;
  }
  try {
    stdout(buildWalletContext(args[0]));
    return 0;
  } catch (error) {
    stderr(`wallet-context: ${error.message}`);
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  process.exitCode = main(process.argv.slice(2));
}
