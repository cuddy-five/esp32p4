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

/**
 * Render review requirements, not completed review results.
 * @param {ReturnType<import("../evidence.js").buildEvidenceContract>} result
 */
export function formatEvidenceMarkdown(result) {
  const { evidence, gates, review_domains: domains } = result;
  const out = [
    `### Evidence & Review Domains (${escapeEvidenceText(evidence.id)})`,
    "",
    "Review-domain mapping reports requirements; it is not proof of completed reviews or permission to merge.",
    "",
    `- **Task ID:** ${escapeEvidenceText(evidence.task_id)}`,
    `- **Subject SHA:** ${escapeEvidenceText(evidence.subject.sha)}`,
    `- **Gates:** evidence_collected=${gates.evidence_collected}, within_scope=${gates.within_scope}, within_budget=${gates.within_budget}`,
  ];
  const policy = evidence.policy_results?.find((row) => row.policy === "review.domains");
  if (policy) out.push(`- **Mapping outcome:** ${escapeEvidenceText(policy.outcome)}`);
  if (!domains) {
    out.push("", "Review-domain mapping is unavailable.");
    return out.join("\n");
  }
  out.push(
    `- **Required roles:** ${domains.required_roles.map(escapeEvidenceText).join(", ") || "none"}`,
    `- **Required security roles:** ${domains.required_security_roles.map(escapeEvidenceText).join(", ") || "none"}`,
  );
  for (const row of domains.covered) {
    out.push(
      "",
      `#### ${escapeEvidenceText(row.domain)}`,
      "",
      `- **Role:** ${escapeEvidenceText(row.role)}`,
      `- **Security role:** ${escapeEvidenceText(row.security_role ?? "none")}`,
      `- **Matched paths:** ${row.paths.map(escapeEvidenceText).join(", ")}`,
      "",
      "Checklist requirements (not evaluated):",
      "",
      ...row.checks.map((check) => `- ${escapeEvidenceText(check)}`),
    );
  }
  if (domains.uncovered.length > 0) {
    out.push("", "**Uncovered paths (no active review domain):**", "", ...domains.uncovered.map((p) => `- ${escapeEvidenceText(p)}`));
  } else if (domains.covered.length === 0) {
    out.push("", "No changed paths to map.");
  }
  return out.join("\n");
}

// Keep arbitrary paths and checklist text inside a single plain-text Markdown item.
// Encode syntax characters as entities rather than trusting inline code fences.
function escapeEvidenceText(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replace(/[\\`*_{}\[\]()#+.!|~-]/g, (char) => `&#${char.charCodeAt(0)};`)
    .replace(/[\r\n\u2028\u2029]/g, " ");
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
