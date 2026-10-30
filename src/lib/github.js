import { execFileSync } from "node:child_process";

const DEFAULT_API_URL = "https://api.github.com";
const USER_AGENT = "control-plane/0.1 (+https://github.com)";
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);
// A 5xx after POST or PATCH may mean the write happened; repeating it could
// duplicate a ruleset or retry a rename. 429 is rejected before processing.
const IDEMPOTENT_METHODS = new Set(["GET", "HEAD", "PUT", "DELETE", "OPTIONS"]);

export class GitHubApiError extends Error {
  /**
   * @param {string} message
   * @param {{ status: number, method: string, path: string, body?: unknown, documentation_url?: string }} info
   */
  constructor(message, info) {
    super(message);
    this.name = "GitHubApiError";
    this.status = info.status;
    this.method = info.method;
    this.path = info.path;
    this.body = info.body;
    this.documentationUrl = info.documentation_url;
  }
}

/**
 * Minimal GitHub REST client over `fetch`. Deliberately dependency-free so the
 * composite actions can run with only `npm ci` of two schema packages.
 *
 * Supports GitHub Enterprise Server via `apiUrl` (`GITHUB_API_URL` in Actions).
 */
export class GitHubClient {
  /**
   * @param {{
   *   token?: string,
   *   apiUrl?: string,
   *   fetch?: typeof fetch,
   *   retries?: number,
   *   backoffMs?: number,
   *   sleep?: (ms: number) => Promise<void>,
   * }} [opts]
   */
  constructor({
    token = resolveToken(),
    apiUrl = process.env.GITHUB_API_URL ?? DEFAULT_API_URL,
    fetch: fetchImpl = globalThis.fetch,
    retries = 3,
    backoffMs = 500,
    sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
  } = {}) {
    if (!token) {
      throw new Error(
        "no GitHub token: set GH_TOKEN or GITHUB_TOKEN, or authenticate the gh CLI (`gh auth login`)",
      );
    }
    this.token = token;
    this.apiUrl = apiUrl.replace(/\/+$/, "");
    this.fetch = fetchImpl;
    this.retries = retries;
    this.backoffMs = backoffMs;
    this.sleep = sleep;
  }

  /**
   * @param {string} method
   * @param {string} path  API path beginning with `/`
   * @param {{ body?: unknown, params?: Record<string, string | number | undefined>, previews?: string[] }} [opts]
   * @returns {Promise<{ status: number, data: any, headers: Headers }>}
   */
  async request(method, path, { body, params } = {}) {
    // URL parsing resolves "." and ".." segments (also as %2e), so a label or
    // repository named ".." would silently address a different endpoint.
    const segments = path.split("?")[0].split("/");
    if (segments.some((s) => /^(\.|%2e){1,2}$/i.test(s))) {
      throw new Error(`refusing ${method} ${path}: "." and ".." are not valid path segments`);
    }
    const url = new URL(this.apiUrl + path);
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined) url.searchParams.set(k, String(v));
      }
    }
    const headers = {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${this.token}`,
      "User-Agent": USER_AGENT,
      "X-GitHub-Api-Version": "2022-11-28",
    };
    const init = { method, headers };
    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(body);
    }

    let attempt = 0;
    for (;;) {
      const res = await this.fetch(url, init);
      const retryable = res.status === 429 || (RETRYABLE_STATUSES.has(res.status) && IDEMPOTENT_METHODS.has(method));
      if (retryable && attempt < this.retries) {
        attempt += 1;
        const retryAfter = Number(res.headers.get("retry-after"));
        const wait = Number.isFinite(retryAfter) && retryAfter > 0
          ? retryAfter * 1000
          : this.backoffMs * 2 ** (attempt - 1);
        await this.sleep(wait);
        continue;
      }
      const text = await res.text();
      let data = null;
      if (text) {
        try {
          data = JSON.parse(text);
        } catch {
          data = text;
        }
      }
      if (!res.ok) {
        const message = typeof data === "object" && data?.message ? data.message : res.statusText;
        throw new GitHubApiError(`${method} ${path} -> ${res.status}: ${message}`, {
          status: res.status,
          method,
          path,
          body: data,
          documentation_url: data?.documentation_url,
        });
      }
      return { status: res.status, data, headers: res.headers };
    }
  }

  /**
   * Follow `Link: rel="next"` headers until exhausted and concatenate array pages.
   * @param {string} path
   * @param {{ params?: Record<string, string | number | undefined>, perPage?: number }} [opts]
   * @returns {Promise<any[]>}
   */
  async paginate(path, { params = {}, perPage = 100 } = {}) {
    const out = [];
    let next = new URL(this.apiUrl + path);
    for (const [k, v] of Object.entries({ ...params, per_page: perPage })) {
      if (v !== undefined) next.searchParams.set(k, String(v));
    }
    while (next) {
      const relPath = next.pathname.slice(new URL(this.apiUrl).pathname.replace(/\/$/, "").length) + next.search;
      const { data, headers } = await this.request("GET", relPath);
      if (!Array.isArray(data)) {
        throw new Error(`expected array page from ${relPath}, got ${typeof data}`);
      }
      out.push(...data);
      const link = parseLinkHeader(headers.get("link"));
      next = link.next ? new URL(link.next) : null;
    }
    return out;
  }
}

/**
 * @param {string | null} header
 * @returns {Record<string, string>}
 */
export function parseLinkHeader(header) {
  const out = {};
  if (!header) return out;
  for (const part of header.split(",")) {
    const m = part.match(/<([^>]+)>\s*;\s*rel="([^"]+)"/);
    if (m) out[m[2]] = m[1];
  }
  return out;
}

/**
 * Token resolution order: GH_TOKEN, GITHUB_TOKEN, then the gh CLI's stored credential.
 * @returns {string | undefined}
 */
export function resolveToken() {
  if (process.env.GH_TOKEN) return process.env.GH_TOKEN;
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;
  try {
    const token = execFileSync("gh", ["auth", "token"], {
      stdio: ["ignore", "pipe", "ignore"],
      encoding: "utf8",
      timeout: 5000,
    }).trim();
    return token || undefined;
  } catch {
    return undefined;
  }
}

/**
 * @typedef {{ owner: string, name: string }} RepoRef
 */

/**
 * Resolve the target repository from an explicit flag, Actions environment, or
 * the `origin` remote of the current checkout.
 * @param {string | undefined} explicit  `owner/name`
 * @param {{ cwd?: string, env?: NodeJS.ProcessEnv }} [opts]
 * @returns {RepoRef}
 */
export function resolveRepo(explicit, { cwd = process.cwd(), env = process.env } = {}) {
  const candidate = explicit ?? env.GH_REPO ?? env.GITHUB_REPOSITORY;
  if (candidate) return parseRepo(candidate);
  try {
    const url = execFileSync("git", ["remote", "get-url", "origin"], {
      cwd,
      stdio: ["ignore", "pipe", "ignore"],
      encoding: "utf8",
      timeout: 5000,
    }).trim();
    const fromUrl = repoFromRemoteUrl(url);
    if (fromUrl) return fromUrl;
  } catch {
    // fall through
  }
  throw new Error(
    "could not determine repository: pass --repo owner/name or set GH_REPO / GITHUB_REPOSITORY",
  );
}

/** @param {string} s */
export function parseRepo(s) {
  const m = s.trim().match(/^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?$/);
  if (!m || isDotSegment(m[1]) || isDotSegment(m[2])) throw new Error(`invalid repository "${s}", expected owner/name`);
  return { owner: m[1], name: m[2] };
}

/** @param {string} url */
export function repoFromRemoteUrl(url) {
  const m =
    url.match(/[:/]([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?\/?$/) ?? null;
  if (!m || isDotSegment(m[1]) || isDotSegment(m[2])) return null;
  return { owner: m[1], name: m[2] };
}

const isDotSegment = (s) => s === "." || s === "..";
