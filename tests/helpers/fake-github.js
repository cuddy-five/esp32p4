import { GitHubClient } from "../../src/lib/github.js";

/**
 * In-memory stand-in for `fetch` that serves canned responses and records
 * every request. Routes are matched by `METHOD /path` with query string
 * stripped; a route value may be a response object or a function of the
 * parsed request body.
 *
 * @param {Record<string, any>} routes
 */
export function fakeFetch(routes) {
  const calls = [];
  const impl = async (url, init = {}) => {
    const u = new URL(url);
    const method = init.method ?? "GET";
    const key = `${method} ${u.pathname}`;
    const body = init.body ? JSON.parse(init.body) : undefined;
    calls.push({ method, path: u.pathname, query: Object.fromEntries(u.searchParams), body });
    let route = routes[key];
    if (typeof route === "function") route = route({ body, query: Object.fromEntries(u.searchParams), call: calls.length });
    if (route === undefined) {
      return response(404, { message: `Not Found: ${key}` });
    }
    if (Array.isArray(route) && route.length && route[0] && "status" in route[0] && "body" in route[0]) {
      // Sequence of responses, consumed in order.
      const next = route.shift();
      return response(next.status, next.body, next.headers);
    }
    if (route && typeof route === "object" && "status" in route && "body" in route) {
      return response(route.status, route.body, route.headers);
    }
    return response(200, route);
  };
  impl.calls = calls;
  return impl;
}

const NULL_BODY_STATUSES = new Set([101, 204, 205, 304]);

function response(status, body, headers = {}) {
  const text = body === undefined || body === null ? "" : typeof body === "string" ? body : JSON.stringify(body);
  return new Response(NULL_BODY_STATUSES.has(status) ? null : text, {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

/**
 * @param {Record<string, any>} routes
 * @param {Partial<ConstructorParameters<typeof GitHubClient>[0]>} [opts]
 */
export function fakeClient(routes, opts = {}) {
  const fetch = fakeFetch(routes);
  const client = new GitHubClient({
    token: "test-token",
    apiUrl: "https://api.example.test",
    fetch,
    sleep: async () => {},
    ...opts,
  });
  return { client, calls: fetch.calls };
}
