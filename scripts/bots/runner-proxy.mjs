/**
 * A CI runner jail's only way out (#1889, ADR-0045): a host-side HTTP
 * CONNECT proxy on a unix socket, which opens a tunnel to port 443 of an
 * allowlisted host and to nothing else.
 *
 * A job on the company's runners runs whatever the workflow on its branch
 * says, so it is treated as hostile. Its jail has no network; this proxy is
 * what it reaches the internet through. It never adds a credential, and
 * every host it refuses is logged by name, so a missing allowlist entry is
 * found from the log and not guessed at.
 *
 * The allowlist (`runner-proxy-allow.json`) is a list of host names. An
 * entry matches its host exactly; one that starts with a dot matches any
 * host below it, never by substring, so `.github.com` matches
 * `api.github.com` and not `github.com.evil.io`. A host is matched
 * lower-cased and without its trailing dot; one with anything but letters,
 * digits, dots and hyphens in it (userinfo, a raw IDN) is refused. So are
 * IP literals, and an allowed name that resolves to a loopback, private or
 * link-local address, so a name cannot lead the tunnel back into the host.
 *
 *     node runner-proxy.mjs <socket> <allow.json>
 *
 * runner-jail.mjs runs one in-process for each jail; this CLI is for
 * trying the allowlist by hand.
 */
import dns from "node:dns/promises";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import { pathToFileURL } from "node:url";

/** The one port a tunnel may open. */
export const HTTPS_PORT = 443;

/** The most tunnels one jail may hold open at once. */
export const MAX_TUNNELS = 256;

/** A tunnel with no traffic either way for this long is closed. */
export const TUNNEL_IDLE_MS = 10 * 60 * 1000;

/** At most this many refusals are logged a minute; the rest are counted. */
export const REFUSALS_LOGGED_A_MINUTE = 30;

/**
 * The allowlist from its JSON: an array of lower-case host names, each
 * optionally starting with a dot.
 *
 * @param {string} json
 * @returns {string[]}
 */
export function parseAllowlist(json) {
  /** @type {unknown} */
  const parsed = JSON.parse(json);
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error("runner-proxy: the allowlist must be a non-empty array");
  }
  return parsed.map((entry) => {
    if (typeof entry !== "string" || !/^\.?[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(entry)) {
      throw new Error(`runner-proxy: not a host name: ${JSON.stringify(entry)}`);
    }
    return entry;
  });
}

/**
 * Text from a request, safe to log on one line: control characters become
 * `?`, so a host name cannot forge a log line.
 *
 * @param {string} text
 * @returns {string}
 */
function printable(text) {
  return text.replace(/[\p{Cc}\u2028\u2029]/gu, "?");
}

/**
 * Where a CONNECT asks to go, or why it may not: port 443 of a host on the
 * allowlist.
 *
 * @param {string | undefined} target the request line's target, `host:port`
 * @param {readonly string[]} allow
 * @returns {{ host: string } | { refused: string }}
 */
export function tunnelTarget(target, allow) {
  const match = /^([^:/\s]+|\[[0-9a-fA-F:.]+\]):(\d+)$/.exec(String(target));
  if (match === null) {
    return { refused: `not host:port: ${printable(String(target))}` };
  }
  const [, rawHost, port] = /** @type {[string, string, string]} */ (match);
  const host = rawHost.toLowerCase().replace(/\.$/, "");
  if (host.startsWith("[") || net.isIP(host) !== 0) {
    return { refused: `IP literal refused: ${host}` };
  }
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)*$/.test(host)) {
    return { refused: `not a host name: ${printable(host)}` };
  }
  if (Number(port) !== HTTPS_PORT) {
    return { refused: `port ${port} refused: ${host}` };
  }
  const allowed = allow.some((entry) =>
    entry.startsWith(".") ? host.endsWith(entry) : host === entry,
  );
  return allowed ? { host } : { refused: `host refused: ${host}` };
}

/**
 * Whether an address is one a tunnel must not reach: loopback, private,
 * link-local, unspecified, or carrier-grade NAT, in either family.
 *
 * @param {string} address
 * @returns {boolean}
 */
export function isInternal(address) {
  const list = new net.BlockList();
  list.addSubnet("0.0.0.0", 8, "ipv4");
  list.addSubnet("10.0.0.0", 8, "ipv4");
  list.addSubnet("100.64.0.0", 10, "ipv4");
  list.addSubnet("127.0.0.0", 8, "ipv4");
  list.addSubnet("169.254.0.0", 16, "ipv4");
  list.addSubnet("172.16.0.0", 12, "ipv4");
  list.addSubnet("192.0.0.0", 24, "ipv4");
  list.addSubnet("192.168.0.0", 16, "ipv4");
  list.addSubnet("198.18.0.0", 15, "ipv4");
  list.addSubnet("224.0.0.0", 4, "ipv4");
  list.addSubnet("240.0.0.0", 4, "ipv4");
  list.addAddress("::", "ipv6");
  list.addAddress("::1", "ipv6");
  // NAT64 and 6to4 both lead to an IPv4 address, internal ones included.
  list.addSubnet("64:ff9b::", 96, "ipv6");
  list.addSubnet("2002::", 16, "ipv6");
  list.addSubnet("fc00::", 7, "ipv6");
  list.addSubnet("fe80::", 10, "ipv6");
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address);
  if (mapped !== null) {
    return list.check(/** @type {string} */ (mapped[1]), "ipv4");
  }
  const hexMapped = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i.exec(address);
  if (hexMapped !== null) {
    const high = Number.parseInt(/** @type {string} */ (hexMapped[1]), 16);
    const low = Number.parseInt(/** @type {string} */ (hexMapped[2]), 16);
    const quad = [high >> 8, high & 255, low >> 8, low & 255].join(".");
    return list.check(quad, "ipv4");
  }
  return list.check(address, net.isIPv6(address) ? "ipv6" : "ipv4");
}

/**
 * A log for refusals that a job cannot flood: the first
 * `REFUSALS_LOGGED_A_MINUTE` of each minute are logged, and the next one
 * logged says how many were dropped before it.
 *
 * @param {(line: string) => void} log
 * @param {() => number} now milliseconds
 * @returns {(line: string) => void}
 */
export function refusalLog(log, now) {
  let minute = -1;
  let logged = 0;
  let dropped = 0;
  return (line) => {
    const current = Math.floor(now() / 60_000);
    if (current !== minute) {
      minute = current;
      logged = 0;
    }
    if (logged >= REFUSALS_LOGGED_A_MINUTE) {
      dropped += 1;
      return;
    }
    logged += 1;
    if (dropped > 0) {
      log(`runner-proxy: ${String(dropped)} refusals not logged`);
      dropped = 0;
    }
    log(line);
  };
}

/**
 * @typedef {object} RunnerProxyOptions
 * @property {readonly string[]} allow
 * @property {(host: string) => Promise<string>} resolve one address for a host name
 * @property {(address: string) => net.Socket} connect opens port 443 of the
 *   address `resolve` gave, never of the name: a second lookup could
 *   answer differently (DNS rebinding)
 * @property {(line: string) => void} log
 */

/**
 * The proxy's server; the caller makes it listen. It holds at most
 * `MAX_TUNNELS` connections, and closes a tunnel idle for
 * `TUNNEL_IDLE_MS`.
 *
 * @param {RunnerProxyOptions} options
 * @returns {http.Server}
 */
export function createRunnerProxy({ allow, resolve, connect, log }) {
  const server = http.createServer((req, res) => {
    log(`runner-proxy: refused ${String(req.method)} ${printable(String(req.url))}: CONNECT only`);
    res.writeHead(405, { "content-type": "text/plain" }).end("CONNECT only\n");
    req.resume();
  });

  server.on("connect", (req, /** @type {net.Socket} */ client, head) => {
    /** @param {string} why */
    const refuse = (why) => {
      log(`runner-proxy: ${why}`);
      client.end("HTTP/1.1 403 Forbidden\r\n\r\n");
    };
    client.on("error", () => {
      client.destroy();
    });
    const target = tunnelTarget(req.url, allow);
    if ("refused" in target) {
      refuse(target.refused);
      return;
    }
    resolve(target.host).then(
      (address) => {
        if (isInternal(address)) {
          refuse(`internal address refused: ${target.host} is ${address}`);
          return;
        }
        const upstream = connect(address);
        upstream.setTimeout(TUNNEL_IDLE_MS, () => {
          upstream.destroy();
          client.destroy();
        });
        let established = false;
        upstream.on("connect", () => {
          established = true;
          client.write("HTTP/1.1 200 Connection Established\r\n\r\n");
          if (head.length > 0) {
            upstream.write(head);
          }
          upstream.pipe(client);
          client.pipe(upstream);
        });
        upstream.on("error", () => {
          if (!established) {
            client.end("HTTP/1.1 502 Bad Gateway\r\n\r\n");
          } else {
            client.destroy();
          }
        });
        client.on("close", () => {
          upstream.destroy();
        });
      },
      () => {
        refuse(`unresolvable: ${target.host}`);
      },
    );
  });

  server.maxConnections = MAX_TUNNELS;
  return server;
}

/** @param {string} host */
export async function lookupAddress(host) {
  return (await dns.lookup(host)).address;
}

/** @param {string} address */
export function connectUpstream(address) {
  return net.connect(HTTPS_PORT, address);
}

/**
 * The proxy, listening on a unix socket only its owner may connect to.
 *
 * @param {string} socket
 * @param {readonly string[]} allow
 * @param {(line: string) => void} log
 * @returns {Promise<http.Server>}
 */
export function listenRunnerProxy(socket, allow, log) {
  fs.rmSync(socket, { force: true });
  const server = createRunnerProxy({
    allow,
    resolve: lookupAddress,
    connect: connectUpstream,
    log: refusalLog(log, Date.now),
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(socket, () => {
      fs.chmodSync(socket, 0o600);
      resolve(server);
    });
  });
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [socket, allowFile] = process.argv.slice(2);
  if (socket === undefined || allowFile === undefined) {
    console.error("usage: runner-proxy.mjs <socket> <allow.json>");
    process.exit(2);
  }
  await listenRunnerProxy(socket, parseAllowlist(fs.readFileSync(allowFile, "utf8")), (line) => {
    console.error(line);
  });
}
