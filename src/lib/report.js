import fs from "node:fs";

const OP_GLYPH = {
  create: "+",
  update: "~",
  rename: ">",
  delete: "-",
  unmanaged: "?",
  noop: "=",
};

const OP_ORDER = ["create", "update", "rename", "delete", "unmanaged", "noop"];

/**
 * @param {unknown} v
 */
function short(v) {
  if (v === undefined) return "<absent>";
  const s = typeof v === "string" ? JSON.stringify(v) : JSON.stringify(v);
  return s.length > 60 ? `${s.slice(0, 57)}...` : s;
}

/**
 * @param {import("./settings/index.js").PlanReport} report
 * @param {{ verbose?: boolean }} [opts]
 * @returns {string}
 */
export function formatPlanText(report, { verbose = false } = {}) {
  const lines = [];
  lines.push(`repository: ${report.repo.owner}/${report.repo.name}`);
  for (const r of report.resources) {
    if (!r.declared) {
      lines.push(`${r.name}: not declared (no ${r.name}.json), skipped`);
      continue;
    }
    const summary = OP_ORDER.filter((t) => r.counts[t])
      .map((t) => `${r.counts[t]} ${t}`)
      .join(", ");
    lines.push(`${r.name}: ${r.drift ? "drift detected" : "in sync"}${summary ? ` (${summary})` : ""}`);
    for (const op of sortOps(r.ops)) {
      if (op.type === "noop" && !verbose) continue;
      const label = op.type === "rename" ? `${op.from} -> ${op.name}` : op.name;
      lines.push(`  ${OP_GLYPH[op.type] ?? " "} ${op.type.padEnd(9)} ${label}`);
      if (op.type === "update" || op.type === "rename") {
        for (const c of op.changes) {
          if (op.type === "rename" && c.path === "/name") continue;
          lines.push(`      ${c.path}: ${short(c.from)} -> ${short(c.to)}`);
        }
      }
    }
  }
  lines.push(report.drift ? "result: drift" : "result: no drift");
  return lines.join("\n");
}

/**
 * GitHub-flavoured Markdown for `$GITHUB_STEP_SUMMARY` and PR comments.
 * @param {import("./settings/index.js").PlanReport} report
 * @param {{ title?: string }} [opts]
 */
export function formatPlanMarkdown(report, { title = "Settings plan" } = {}) {
  const out = [];
  out.push(`### ${title}: \`${report.repo.owner}/${report.repo.name}\``);
  out.push("");
  out.push(report.drift ? "**Drift detected.**" : "No drift.");
  out.push("");
  for (const r of report.resources) {
    if (!r.declared) {
      out.push(`- \`${r.name}\`: not declared, skipped`);
      continue;
    }
    const summary = OP_ORDER.filter((t) => r.counts[t])
      .map((t) => `${r.counts[t]} ${t}`)
      .join(", ");
    out.push(`- \`${r.name}\`: ${r.drift ? "drift" : "in sync"}${summary ? ` (${summary})` : ""}`);
  }
  const driftOps = report.resources.flatMap((r) =>
    sortOps(r.ops)
      .filter((op) => op.type !== "noop" && op.type !== "unmanaged")
      .map((op) => ({ resource: r.name, op })),
  );
  if (driftOps.length > 0) {
    out.push("");
    out.push("| Resource | Op | Name | Changes |");
    out.push("|---|---|---|---|");
    for (const { resource, op } of driftOps) {
      const label = op.type === "rename" ? `${op.from} → ${op.name}` : op.name;
      const changes = op.changes
        .filter((c) => !((op.type === "rename" || op.type === "create") && c.path === "/name"))
        .map((c) => `\`${c.path}\`: ${escapeCell(short(c.from))} → ${escapeCell(short(c.to))}`)
        .join("<br>");
      out.push(`| ${resource} | ${op.type} | \`${label}\` | ${changes || "—"} |`);
    }
  }
  return out.join("\n");
}

function escapeCell(s) {
  return String(s).replaceAll("|", "\\|");
}

/**
 * Append to the Actions step summary when running inside a workflow.
 * @param {string} markdown
 * @param {NodeJS.ProcessEnv} [env]
 */
export function writeStepSummary(markdown, env = process.env) {
  if (!env.GITHUB_STEP_SUMMARY) return false;
  fs.appendFileSync(env.GITHUB_STEP_SUMMARY, `${markdown}\n\n`);
  return true;
}

/**
 * Emit `::error file=...,line=...::message` annotations for Actions.
 * @param {{ file: string, errors: Array<{ path: string, message: string }> }} result
 */
export function formatAnnotations(result) {
  return result.errors.map((e) => `::error file=${result.file}::${e.path}: ${e.message}`);
}

function sortOps(ops) {
  return [...ops].sort((a, b) => {
    const ta = OP_ORDER.indexOf(a.type);
    const tb = OP_ORDER.indexOf(b.type);
    if (ta !== tb) return ta - tb;
    return a.name.localeCompare(b.name);
  });
}
