/*
 * Jev connection: the telephone that sends our question sheet.
 * This file knows how to contact Jev, not what our intake categories mean.
 * Reference: https://docs.typesafe.ai/api/system-one
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const ENDPOINT = "https://api.typesafe.ai/v1/systemone";
export const MAX_REQUEST_BYTES = 64 * 1024;
export const MAX_RESPONSE_BYTES = 1024 * 1024;

// ADR 0003: TypeSafe System One pricing & spending cap guardrail.
// Jev charges $0.042 per 1,000,000 input tokens; output is $0 (typed decision primitives).
export const DEFAULT_DAILY_CAP_USD = 2.0;
export const PRICE_PER_INPUT_TOKEN_USD = 0.042 / 1_000_000;

/**
 * Resolve the daily usage ledger path.
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string}
 */
export function getLedgerPath(env = process.env) {
  if (env.JEV_LEDGER_FILE?.trim()) return env.JEV_LEDGER_FILE.trim();
  return path.join(os.homedir(), ".config", "esp32p4", "jev-ledger.json");
}

/**
 * Read the current day's ledger. Resets automatically on a new calendar day (UTC).
 * @param {{
 *   ledgerPath?: string,
 *   dateStr?: string,
 *   dailyCapUsd?: number,
 * }} [opts]
 * @returns {{
 *   date: string,
 *   daily_cap_usd: number,
 *   total_spent_usd: number,
 *   total_input_tokens: number,
 *   total_output_tokens: number,
 *   calls: number,
 * }}
 */
export function loadJevLedger({
  ledgerPath = getLedgerPath(),
  dateStr = new Date().toISOString().slice(0, 10),
  dailyCapUsd = DEFAULT_DAILY_CAP_USD,
} = {}) {
  if (fs.existsSync(ledgerPath)) {
    let data;
    try {
      data = JSON.parse(fs.readFileSync(ledgerPath, "utf8"));
    } catch (err) {
      throw new Error(
        `Jev ledger at "${ledgerPath}" is corrupted: ${err.message}. Manual review required before calling Jev.`,
      );
    }
    if (data && data.date === dateStr) {
      return {
        date: dateStr,
        daily_cap_usd: Number(data.daily_cap_usd ?? dailyCapUsd),
        total_spent_usd: Number(data.total_spent_usd ?? 0),
        total_input_tokens: Number(data.total_input_tokens ?? 0),
        total_output_tokens: Number(data.total_output_tokens ?? 0),
        calls: Number(data.calls ?? 0),
      };
    }
  }
  return {
    date: dateStr,
    daily_cap_usd: dailyCapUsd,
    total_spent_usd: 0,
    total_input_tokens: 0,
    total_output_tokens: 0,
    calls: 0,
  };
}

/**
 * Verify whether Jev calls remain within the daily spending ceiling.
 * Throws a safe error when the cap is exhausted.
 * @param {{
 *   ledgerPath?: string,
 *   dailyCapUsd?: number,
 *   dateStr?: string,
 *   env?: NodeJS.ProcessEnv,
 * }} [opts]
 */
export function checkSpendingCap({
  ledgerPath = getLedgerPath(),
  dailyCapUsd = DEFAULT_DAILY_CAP_USD,
  dateStr = new Date().toISOString().slice(0, 10),
  env = process.env,
} = {}) {
  const cap = env.JEV_DAILY_CAP_USD ? Number.parseFloat(env.JEV_DAILY_CAP_USD) : dailyCapUsd;
  const ledger = loadJevLedger({ ledgerPath, dateStr, dailyCapUsd: cap });
  if (ledger.total_spent_usd >= cap) {
    throw new Error(
      `Jev daily spending cap reached ($${ledger.total_spent_usd.toFixed(4)} / $${cap.toFixed(2)}). Pause and notify owner before calling Jev.`,
    );
  }
  return ledger;
}

/**
 * Record token consumption and computed dollar cost to the ledger.
 * @param {{ input_tokens?: number, output_tokens?: number }} usage
 * @param {{
 *   ledgerPath?: string,
 *   dailyCapUsd?: number,
 *   dateStr?: string,
 *   pricePerInputToken?: number,
 *   env?: NodeJS.ProcessEnv,
 * }} [opts]
 */
export function recordJevUsage(usage, {
  ledgerPath = getLedgerPath(),
  dailyCapUsd = DEFAULT_DAILY_CAP_USD,
  dateStr = new Date().toISOString().slice(0, 10),
  pricePerInputToken = PRICE_PER_INPUT_TOKEN_USD,
  env = process.env,
} = {}) {
  const cap = env.JEV_DAILY_CAP_USD ? Number.parseFloat(env.JEV_DAILY_CAP_USD) : dailyCapUsd;
  const ledger = loadJevLedger({ ledgerPath, dateStr, dailyCapUsd: cap });
  const inputTokens = Number.isSafeInteger(usage?.input_tokens) ? usage.input_tokens : 0;
  const outputTokens = Number.isSafeInteger(usage?.output_tokens) ? usage.output_tokens : 0;
  const cost = inputTokens * pricePerInputToken;

  ledger.total_spent_usd = Number((ledger.total_spent_usd + cost).toFixed(6));
  ledger.total_input_tokens += inputTokens;
  ledger.total_output_tokens += outputTokens;
  ledger.calls += 1;

  const tmpPath = `${ledgerPath}.tmp.${process.pid}.${Date.now()}`;
  try {
    fs.mkdirSync(path.dirname(ledgerPath), { recursive: true });
    fs.writeFileSync(tmpPath, `${JSON.stringify(ledger, null, 2)}\n`, "utf8");
    fs.renameSync(tmpPath, ledgerPath);
  } catch {
    try {
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    } catch {}
    // If non-writable filesystem or mock environment, keep in-memory ledger
  }
  return ledger;
}

/**
 * Load TYPESAFE_API_KEY from environment or strict mode 0600 file.
 * Single source of truth across CLI, runner, and triage.
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string}
 */
export function loadApiKey(env = process.env) {
  if (env.TYPESAFE_API_KEY?.trim()) return env.TYPESAFE_API_KEY.trim();
  const keyPath =
    env.TYPESAFE_API_KEY_FILE?.trim() ||
    path.join(os.homedir(), ".config", "esp32p4", "jev-api-key");
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
      "Provide TYPESAFE_API_KEY, TYPESAFE_API_KEY_FILE, or an owner-only ~/.config/esp32p4/jev-api-key file (mode 600).",
    );
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

/*
 * `async` lets us wait for the internet without freezing Node.
 * The options object supplies the key and an optional deadline.
 * fetchImpl normally uses Node's built-in fetch: no new package needed.
 * A caller can supply a replacement later to check network failure handling.
 */
export async function requestJev(request, {
  apiKey,
  timeoutMs = 15000,
  fetchImpl = globalThis.fetch,
  enforceSpendingCap = true,
  dailyCapUsd = DEFAULT_DAILY_CAP_USD,
  ledgerPath,
  env = process.env,
} = {}) {
  if (typeof apiKey !== "string" || !apiKey.trim()) {
    throw new Error("Set TYPESAFE_API_KEY before calling Jev.");
  }
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 120000) {
    throw new Error("Jev timeout must be between 1 and 120000 milliseconds.");
  }
  if (!request || typeof request.model !== "string" || !request.model.trim() ||
      request.state == null || !request.questions ||
      typeof request.questions !== "object" || Array.isArray(request.questions) ||
      Object.keys(request.questions).length === 0) {
    throw new Error("Jev requires a model, state, and named questions.");
  }

  // Pre-flight spending cap check: prevent unbudgeted calls before hitting the wire
  const resolvedLedgerPath = ledgerPath ?? getLedgerPath(env);
  if (enforceSpendingCap) {
    checkSpendingCap({ ledgerPath: resolvedLedgerPath, dailyCapUsd, env });
  }

  // Pack the form into JSON text. These byte limits belong to our application;
  // they are deliberately smaller than the provider's maximum request limits.
  let body;
  try {
    body = JSON.stringify(request);
  } catch {
    throw new Error("The Jev request cannot be represented as JSON.");
  }
  if (Buffer.byteLength(body, "utf8") > MAX_REQUEST_BYTES) {
    throw new Error("The Jev request exceeds this application's 64 KiB limit.");
  }

  // AbortController is a stop button. Our timer presses it when time runs out,
  // including while the answer is arriving. This prevents waiting forever.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey.trim()}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body,
      signal: controller.signal,
      redirect: "error", // Do not follow a redirect to an unexpected destination.
    });
    if (!response.ok) {
      controller.abort();
      // Report the status, never a server error body that could echo private input.
      // One attempt per invocation: there are no hidden retries or extra charges.
      throw new Error(`Jev returned HTTP ${response.status}; use manual intake.`);
    }
    if (!response.body) throw new Error("Jev returned an empty response.");

    // `for await` waits for each piece of the answer. Count its bytes before
    // keeping it, so an unexpectedly large reply cannot grow without a limit.
    const chunks = [];
    let bytes = 0;
    for await (const chunk of response.body) {
      bytes += chunk.byteLength;
      if (bytes > MAX_RESPONSE_BYTES) {
        controller.abort();
        throw new Error("Jev response exceeds this application's 1 MiB limit.");
      }
      chunks.push(chunk);
    }
    let result;
    try {
      result = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
      throw new Error("Jev returned invalid JSON; use manual intake.");
    }
    // Check the shared envelope. routing.js checks the particular intake answer.
    if (typeof result?.model !== "string" || !result.model.trim() ||
        !result.answers || typeof result.answers !== "object" || Array.isArray(result.answers) ||
        !Number.isSafeInteger(result.usage?.input_tokens) || result.usage.input_tokens < 0 ||
        !Number.isSafeInteger(result.usage?.output_tokens) || result.usage.output_tokens < 0) {
      throw new Error("Jev returned an invalid response envelope; use manual intake.");
    }

    // Post-flight usage recording & budget ledger update
    if (enforceSpendingCap) {
      const updatedLedger = recordJevUsage(result.usage, {
        ledgerPath: resolvedLedgerPath,
        dailyCapUsd,
        env,
      });
      result.spending = {
        total_spent_usd: updatedLedger.total_spent_usd,
        daily_cap_usd: updatedLedger.daily_cap_usd,
        calls_today: updatedLedger.calls,
      };
    }

    return result;
  } catch (error) {
    if (error?.name === "AbortError" || error?.name === "TimeoutError") {
      throw new Error("Jev request timed out; use manual intake.");
    }
    // Keep our safe messages; hide network details and raw error stacks.
    if (error instanceof Error && error.message.startsWith("Jev ")) throw error;
    throw new Error("Jev connection failed; use manual intake.");
  } finally {
    clearTimeout(timer); // `finally` runs on success AND failure.
  }
}
