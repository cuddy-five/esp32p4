/*
 * Jev connection: the telephone that sends our question sheet.
 * This file knows how to contact Jev, not what our intake categories mean.
 * Reference: https://docs.typesafe.ai/api/system-one
 */
const ENDPOINT = "https://api.typesafe.ai/v1/systemone";
const MAX_REQUEST_BYTES = 64 * 1024;
const MAX_RESPONSE_BYTES = 1024 * 1024;

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
