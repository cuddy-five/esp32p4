/*
 * Entry point: connect routing's question sheet to Jev's telephone.
 * To make a REAL call from the repository root:
 * node src/run-jev.js --yes --model YOUR_MODEL "Find why the build fails."
 *
 * `node` runs JavaScript; src/run-jev.js selects this file.
 * --yes permits sending your supplied text to TypeSafe.
 * --model chooses a model available to your account (replace YOUR_MODEL).
 * The quoted final argument is the request text; no repository files are read.
 * --help prints usage without a call. TYPESAFE_MODEL can supply the model
 * instead of --model. The key comes from TYPESAFE_API_KEY when set, otherwise
 * from ~/.config/esp32p4/jev-api-key, a private file outside the repository.
 * Never put the key in this file or a command-line argument.
 */
import { buildIntakeRequest, interpretIntakeResponse } from "./routing.js";
import { requestJev } from "./jev.js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const usage = 'Usage: node src/run-jev.js --yes [--model NAME] "request text"';

/*
 * ELI5: The program knows where the locked drawer is; the key itself never
 * belongs in our source code. An environment variable takes priority so a
 * future GitHub workflow can supply its own secret without a local file.
 * Permission 600 means only your user can read or change the local file.
 */
function loadApiKey() {
  if (process.env.TYPESAFE_API_KEY?.trim()) return process.env.TYPESAFE_API_KEY.trim();
  const keyPath = path.join(os.homedir(), ".config", "esp32p4", "jev-api-key");
  let fd;
  try {
    // Open the actual file, not a symbolic link pointing somewhere else.
    fd = fs.openSync(keyPath, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    const info = fs.fstatSync(fd);
    if (!info.isFile() || (info.mode & 0o077) !== 0 ||
        info.uid !== process.getuid() || info.size > 4096) {
      throw new Error("Invalid private key file.");
    }
    const key = fs.readFileSync(fd, "utf8").trim();
    if (!key || /\s/.test(key)) throw new Error("Invalid key format.");
    return key;
  } catch {
    // Fixed error text prevents accidentally printing the key or file contents.
    throw new Error("Provide TYPESAFE_API_KEY or an owner-only ~/.config/esp32p4/jev-api-key file (mode 600).");
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

async function main() {
  // argv starts with Node's path and this file's path. Skip those two entries.
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === "--help") {
    console.log(`${usage}\nRequires --model or TYPESAFE_MODEL. Key: TYPESAFE_API_KEY or ~/.config/esp32p4/jev-api-key.`);
    return 0;
  }
  let model = process.env.TYPESAFE_MODEL;
  let confirmed = false;
  let text;
  let request;
  try {
    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      if (arg === "--yes" && !confirmed) confirmed = true;
      else if (arg === "--model" && args[i + 1] && !args[i + 1].startsWith("--")) {
        model = args[++i];
      } else if (!arg.startsWith("--") && text === undefined) text = arg;
      else throw new Error(usage);
    }
    if (!confirmed) throw new Error(`A live call requires --yes. ${usage}`);
    request = buildIntakeRequest(text, model);
  } catch (error) {
    console.error(error.message);
    return 2; // Repository convention: invalid input or invocation.
  }

  try {
    const response = await requestJev(request, { apiKey: loadApiKey() });
    const advice = interpretIntakeResponse(response, request);
    // Show the actual model choice and usage. No agent is launched and no
    // task state or approval changes. You inspect whether the answer fits.
    console.log(JSON.stringify(advice, null, 2));
    return 0;
  } catch (error) {
    console.error(error.message);
    return 1; // Operational failure; use manual intake.
  }
}

// Let Node finish printing before it exits with the result code.
process.exitCode = await main();
