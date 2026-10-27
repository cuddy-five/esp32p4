import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

/** Root of the control-plane checkout, regardless of the current working directory. */
export const REPO_ROOT = path.resolve(here, "..", "..");

export const CONTROL_PLANE_DIR = path.join(REPO_ROOT, ".github", "control-plane");
export const CONTRACTS_DIR = path.join(CONTROL_PLANE_DIR, "contracts");
export const SETTINGS_DIR = path.join(CONTROL_PLANE_DIR, "settings");

/**
 * Normalize repository-relative paths:
 * Strips leading `./` or duplicate `./` sequences so that relative paths match
 * standard repository-relative contract globs and policy rules.
 *
 * @param {string} filePath
 * @returns {string}
 */
export function normalizeRepoPath(filePath) {
  if (typeof filePath !== "string") return "";
  return filePath.replace(/^(\.\/)+/, "");
}

/**
 * Resolve project-root directories and declarations for consumer repository adoption.
 * When an explicit `--project <dir>` is passed, verifies that the directory exists
 * and locates consumer declarations without silently falling back to the engine repository.
 *
 * @param {string | undefined} projectDir
 * @returns {{
 *   projectDir: string,
 *   controlPlaneDir: string,
 *   settingsDir: string,
 *   stateMachineFile: string,
 *   approvalsFile: string,
 *   reviewDomainsFile: string,
 *   isExplicit: boolean,
 * }}
 */
export function resolveProjectPaths(projectDir) {
  if (projectDir) {
    const abs = path.resolve(process.cwd(), projectDir);
    if (!fs.existsSync(abs) || !fs.statSync(abs).isDirectory()) {
      throw new Error(`consumer project directory not found: "${projectDir}"`);
    }
    const controlPlaneDir = path.join(abs, ".github", "control-plane");
    return {
      projectDir: abs,
      controlPlaneDir,
      settingsDir: path.join(controlPlaneDir, "settings"),
      stateMachineFile: path.join(controlPlaneDir, "orchestration", "state-machine.yaml"),
      approvalsFile: path.join(controlPlaneDir, "policies", "approvals.yaml"),
      reviewDomainsFile: path.join(abs, ".review-domains.json"),
      isExplicit: true,
    };
  }
  return {
    projectDir: REPO_ROOT,
    controlPlaneDir: CONTROL_PLANE_DIR,
    settingsDir: SETTINGS_DIR,
    stateMachineFile: path.join(CONTROL_PLANE_DIR, "orchestration", "state-machine.yaml"),
    approvalsFile: path.join(CONTROL_PLANE_DIR, "policies", "approvals.yaml"),
    reviewDomainsFile: path.join(REPO_ROOT, ".review-domains.json"),
    isExplicit: false,
  };
}
