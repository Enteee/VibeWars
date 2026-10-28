/**
 * The support jail's only way out (#148, ADR-0025): a host-side HTTP proxy
 * on a unix socket, which forwards to the Anthropic API and nowhere else,
 * and adds the company's Claude credential (ADR-0031) itself.
 *
 * Support reads strangers' text, so it is assumed prompt-injected, and
 * whatever it can read it can paste into a public reply. So its jail holds
 * no credential: Claude in there talks to this proxy, which reads the
 * company's OAuth access token from `.credentials.json` on every request
 * and sends it upstream. A credential header the jail sends is dropped, so
 * the jail cannot pick the account either.
 *
 * The proxy never writes or refreshes that file: the other jails' Claude
 * sessions keep it fresh, and it keeps one writer. An expired token pauses
 * support (503) until they do.
 *
 * A login has no per-key spend limit, so the hourly request budget is the
 * only cap on what an injected support agent can spend (429 over it).
 *
 *     node support-proxy.mjs <socket> <credentials.json> <requests per hour>
 */
import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import { pathToFileURL } from "node:url";

/** The one host the proxy forwards to. */
export const API_HOST = "api.anthropic.com";

/** Requests per hour when `company.json` names no `supportRequestsPerHour`. */
export const DEFAULT_REQUESTS_PER_HOUR = 200;

/** The beta flag the API wants on a request authorized by an OAuth token. */
export const OAUTH_BETA = "oauth-2025-04-20";

/** The API's paths; anything else is refused, never forwarded. */
const API_PATH = /^\/v1\/[A-Za-z0-9/_.-]*(\?[^#]*)?$/;

const HOUR_MS = 3_600_000;

/**
 * Headers never forwarded, in either direction: credentials and cookies
 * (the proxy picks the account, and no session comes back to the jail),
 * and the hop-by-hop ones.
 */
const DROPPED = new Set([
  "authorization",
  "x-api-key",
  "proxy-authorization",
  "cookie",
  "set-cookie",
  "host",
  "connection",
  "keep-alive",
  "proxy-connection",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

/**
 * The access token in a `.credentials.json`, if it is one and still valid.
 *
 * @param {string | null} text the file's contents; null if it could not be read
 * @param {number} now epoch ms
 * @returns {{ token: string } | { refused: string }}
 */
export function accessToken(text, now) {
  /** @type {unknown} */
  let parsed;
  try {
    parsed = text === null ? null : JSON.parse(text);
  } catch {
    parsed = null;
  }
  const oauth =
    typeof parsed === "object" && parsed !== null && "claudeAiOauth" in parsed
      ? parsed.claudeAiOauth
      : null;
  if (typeof oauth !== "object" || oauth === null) {
    return { refused: "support paused: no credential" };
  }
  const token = "accessToken" in oauth ? oauth.accessToken : null;
  const expiresAt = "expiresAt" in oauth ? oauth.expiresAt : null;
  if (typeof token !== "string" || token === "" || typeof expiresAt !== "number") {
    return { refused: "support paused: no credential" };
  }
  if (expiresAt <= now) {
    return { refused: "support paused: credential expired" };
  }
  return { token };
}

/**
 * Why a request is not forwarded, or null if it is: only the API's own
 * paths, as origin-form URLs, so a jail cannot name another host.
 *
 * @param {string | undefined} url the request line's target
 * @returns {string | null}
 */
export function refusal(url) {
  return url !== undefined && API_PATH.test(url) ? null : "only the Anthropic API is reachable";
}

/**
 * Whether one more request fits in the hour's budget.
 *
 * @param {readonly number[]} admitted epoch ms of the requests admitted so far
 * @param {number} now
 * @param {number} perHour
 * @returns {{ admit: boolean, admitted: number[] }}
 */
export function admitRequest(admitted, now, perHour) {
  const recent = admitted.filter((at) => now - at < HOUR_MS);
  return recent.length < perHour
    ? { admit: true, admitted: [...recent, now] }
    : { admit: false, admitted: recent };
}

/**
 * The headers sent upstream: the jail's, without any credential or
 * hop-by-hop header, with the company's token and the OAuth beta flag.
 *
 * @param {http.IncomingHttpHeaders} incoming
 * @param {string} token
 * @returns {Record<string, string | string[]>}
 */
export function upstreamHeaders(incoming, token) {
  /** @type {Record<string, string | string[]>} */
  const headers = {};
  for (const [name, value] of Object.entries(incoming)) {
    if (value !== undefined && !DROPPED.has(name.toLowerCase())) {
      headers[name.toLowerCase()] = value;
    }
  }
  const betas = String(headers["anthropic-beta"] ?? "")
    .split(",")
    .map((beta) => beta.trim())
    .filter((beta) => beta !== "");
  headers["anthropic-beta"] = [...new Set([...betas, OAUTH_BETA])].join(",");
  headers.authorization = `Bearer ${token}`;
  headers.host = API_HOST;
  return headers;
}

/**
 * @param {http.IncomingHttpHeaders} incoming
 * @returns {Record<string, string | string[]>}
 */
function downstreamHeaders(incoming) {
  /** @type {Record<string, string | string[]>} */
  const headers = {};
  for (const [name, value] of Object.entries(incoming)) {
    if (value !== undefined && !DROPPED.has(name.toLowerCase())) {
      headers[name] = value;
    }
  }
  return headers;
}

/**
 * @typedef {object} ProxyOptions
 * @property {() => string | null} readCredentials the credentials file, read anew per request
 * @property {number} perHour the request budget
 * @property {() => number} now epoch ms
 * @property {(options: https.RequestOptions) => http.ClientRequest} upstream opens a request to API_HOST
 * @property {(line: string) => void} log
 */

/**
 * The proxy's server; the caller makes it listen.
 *
 * @param {ProxyOptions} options
 * @returns {http.Server}
 */
export function createSupportProxy({ readCredentials, perHour, now, upstream, log }) {
  /** @type {number[]} */
  let admitted = [];
  /** @type {string | null} the last refusal logged, so each says so once */
  let logged = null;

  /**
   * @param {http.ServerResponse} res
   * @param {number} status
   * @param {string} text
   */
  const refuse = (res, status, text) => {
    if (logged !== text) {
      log(`support-proxy: ${text}`);
      logged = text;
    }
    res.writeHead(status, { "content-type": "text/plain" }).end(`${text}\n`);
  };

  return http.createServer((req, res) => {
    const refused = refusal(req.url);
    if (refused !== null) {
      refuse(res, 403, refused);
      req.resume();
      return;
    }
    const budget = admitRequest(admitted, now(), perHour);
    admitted = budget.admitted;
    if (!budget.admit) {
      refuse(res, 429, `support paused: over ${String(perHour)} requests this hour`);
      req.resume();
      return;
    }
    const credential = accessToken(readCredentials(), now());
    if ("refused" in credential) {
      refuse(res, 503, credential.refused);
      req.resume();
      return;
    }
    logged = null;
    const out = upstream({
      method: req.method,
      path: req.url,
      headers: upstreamHeaders(req.headers, credential.token),
    });
    out.on("response", (answer) => {
      res.writeHead(answer.statusCode ?? 502, downstreamHeaders(answer.headers));
      answer.pipe(res);
    });
    out.on("error", () => {
      if (!res.headersSent) {
        res.writeHead(502, { "content-type": "text/plain" }).end("upstream unreachable\n");
      } else {
        res.destroy();
      }
    });
    req.pipe(out);
  });
}

/**
 * @param {string} file
 * @returns {string | null}
 */
function readOrNull(file) {
  try {
    return fs.readFileSync(file, "utf8");
  } catch {
    return null;
  }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [socket, credentials, budget] = process.argv.slice(2);
  const perHour = Number(budget);
  if (
    socket === undefined ||
    credentials === undefined ||
    !(Number.isInteger(perHour) && perHour > 0)
  ) {
    console.error("usage: support-proxy.mjs <socket> <credentials.json> <requests per hour>");
    process.exit(2);
  }
  fs.rmSync(socket, { force: true });
  const server = createSupportProxy({
    readCredentials: () => readOrNull(credentials),
    perHour,
    now: Date.now,
    upstream: (options) => https.request({ ...options, host: API_HOST, port: 443 }),
    log: (line) => {
      console.error(line);
    },
  });
  server.listen(socket, () => {
    fs.chmodSync(socket, 0o600);
  });
}
