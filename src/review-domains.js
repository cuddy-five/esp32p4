/*
 * Review domains: which checklist applies to a changed file.
 *
 * The reviewer role does not change when the language changes. This file
 * only chooses the enabled checklist. It does not launch an agent, write
 * code, or approve a merge. The firmware checklist is declared for no_std
 * Rust and stays off until that tree exists.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { globMatch } from "./lib/orchestration.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const REVIEW_DOMAINS_FILE = path.join(repoRoot, ".review-domains.json");

const ID_PATTERN = /^[a-z][a-z0-9-]{0,63}$/;
const ROLES = new Set(["reviewer", "security_auditor"]);
const LANGUAGES = new Set(["javascript", "rust"]);
const KEYS = new Set([
  "id", "enabled", "language", "constraint", "requires_root", "role", "security_role", "paths", "checks",
]);

function globOk(value) {
  if (typeof value !== "string" || value.startsWith("/") || value.includes("\\") || value.includes("..")) {
    return false;
  }
  return value.split("/").every((part) => part.length > 0 && /^[A-Za-z0-9._*-]+$/.test(part));
}

function pathOk(value) {
  if (typeof value !== "string" || value.startsWith("/") || value.includes("\\") || value.includes("*")) {
    return false;
  }
  const clean = value.replace(/^\.\//, "");
  return clean.length > 0 && clean.split("/").every((part) => part.length > 0 && part !== "." && part !== "..");
}

export function reviewDomainProblems(doc, { pathExists } = {}) {
  if (!doc || doc.schema_version !== 1 || !Array.isArray(doc.domains)) {
    return ["Review domains must be schema_version 1 with a domains list."];
  }
  const problems = [];
  const seen = new Set();
  for (const domain of doc.domains) {
    const id = typeof domain?.id === "string" ? domain.id : "(missing id)";
    if (!domain || typeof domain !== "object" || !ID_PATTERN.test(domain.id ?? "")) {
      problems.push(`Review domain "${id}" has an invalid id.`);
      continue;
    }
    if (seen.has(domain.id)) problems.push(`Duplicate review domain "${domain.id}".`);
    seen.add(domain.id);
    for (const key of Object.keys(domain)) {
      if (!KEYS.has(key)) problems.push(`${domain.id}: unknown field ${key}.`);
    }
    if (typeof domain.enabled !== "boolean") problems.push(`${domain.id}: enabled must be boolean.`);
    if (!LANGUAGES.has(domain.language)) problems.push(`${domain.id}: language must be javascript or rust.`);
    if (domain.constraint !== undefined && domain.constraint !== "no_std") {
      problems.push(`${domain.id}: unknown constraint.`);
    }
    if (domain.language === "rust" && domain.constraint !== "no_std") {
      problems.push(`${domain.id}: Rust review must be no_std.`);
    }
    if (!ROLES.has(domain.role)) problems.push(`${domain.id}: role must be reviewer or security_auditor.`);
    if (domain.security_role !== undefined && domain.security_role !== "security_auditor") {
      problems.push(`${domain.id}: security_role must be security_auditor.`);
    }
    if (domain.requires_root !== undefined && !/^[A-Za-z0-9._-]+$/.test(domain.requires_root)) {
      problems.push(`${domain.id}: requires_root must be one relative directory name.`);
    }
    if (!Array.isArray(domain.paths) || domain.paths.length === 0 || domain.paths.some((item) => !globOk(item))) {
      problems.push(`${domain.id}: paths must be relative globs.`);
    }
    if (!Array.isArray(domain.checks) || domain.checks.length === 0 ||
        domain.checks.some((item) => typeof item !== "string" || item.trim().length < 20)) {
      problems.push(`${domain.id}: checks must be plain sentences.`);
    }
    if (pathExists && domain.enabled && domain.requires_root && !pathExists(domain.requires_root)) {
      problems.push(`${domain.id}: enabled but ${domain.requires_root}/ does not exist.`);
    }
  }
  return problems;
}

export function loadReviewDomains(file = REVIEW_DOMAINS_FILE) {
  let doc;
  try {
    doc = JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    throw new Error(`Review domains file is unreadable: ${error.message}`);
  }
  const root = path.dirname(file);
  const problems = reviewDomainProblems(doc, { pathExists: (name) => existsSync(path.join(root, name)) });
  if (problems.length > 0) throw new Error(problems.join(" "));
  return doc;
}

export function selectReviewDomains(paths, domains) {
  const problems = reviewDomainProblems(domains);
  if (problems.length > 0) throw new Error(problems.join(" "));
  if (!Array.isArray(paths) || paths.length === 0 || paths.some((file) => !pathOk(file))) {
    throw new TypeError("Review domain selection needs relative file paths.");
  }
  const cleanPaths = paths.map((file) => file.replace(/^\.\//, ""));
  const enabled = domains.domains.filter((domain) => domain.enabled);
  const covered = [];
  const uncovered = [];
  for (const file of cleanPaths) {
    const hits = enabled.filter((domain) => domain.paths.some((pattern) => globMatch(pattern, file)));
    if (hits.length === 0) {
      uncovered.push(file);
      continue;
    }
    for (const hit of hits) {
      let row = covered.find((item) => item.domain === hit.id);
      if (!row) {
        row = {
          domain: hit.id,
          role: hit.role,
          security_role: hit.security_role ?? null,
          checks: hit.checks,
          paths: [],
        };
        covered.push(row);
      }
      row.paths.push(file);
    }
  }
  return { covered, uncovered };
}
