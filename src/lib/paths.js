import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

/** Root of the control-plane checkout, regardless of the current working directory. */
export const REPO_ROOT = path.resolve(here, "..", "..");

export const CONTROL_PLANE_DIR = path.join(REPO_ROOT, ".github", "control-plane");
export const CONTRACTS_DIR = path.join(CONTROL_PLANE_DIR, "contracts");
export const SETTINGS_DIR = path.join(CONTROL_PLANE_DIR, "settings");
