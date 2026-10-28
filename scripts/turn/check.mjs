/**
 * turn-check (#974): is the TURN server up and usable from the internet?
 * Each check is ok, fail or skip (not configured); healthy is no fail.
 */
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import dns from "node:dns/promises";
import fs from "node:fs";
import net from "node:net";
import process from "node:process";

import { files, ownAddresses, tls } from "./settings.mjs";
import { allocate, binding, permissions } from "./stun.mjs";
import { HEALTH_USER, healthPassword } from "./users.mjs";

/** @typedef {{ name: string, status: "ok" | "fail" | "skip", detail: string }} Check */

/** A certificate with fewer days left than this fails the check. */
export const CERT_DAYS_MIN = 7;

/**
 * The running turnserver's pid, from its pid file.
 *
 * @param {import("./settings.mjs").TurnSettings} s
 * @returns {{ pid: number } | { pid: null, why: string }}
 */
export function serverPid(s) {
  let text;
  try {
    text = fs.readFileSync(files(s).pid, "utf8").trim();
  } catch {
    return { pid: null, why: "not running (no pid file)" };
  }
  const pid = Number(text);
  if (!Number.isInteger(pid) || pid <= 0) return { pid: null, why: "not running (bad pid file)" };
  try {
    process.kill(pid, 0);
  } catch {
    return { pid: null, why: `not running (pid ${String(pid)} is gone)` };
  }
  return { pid };
}

/**
 * Where the checks reach the server: its first listening address, or
 * loopback when it listens on every interface.
 *
 * @param {import("./settings.mjs").TurnSettings} s
 */
export function checkHost(s) {
  const ip = s.listeningIps.find((a) => a !== "0.0.0.0" && a !== "::");
  return ip ?? "127.0.0.1";
}

/**
 * Whether an IPv4 address is one the internet cannot reach: private,
 * loopback, link-local or carrier-grade NAT (100.64/10).
 *
 * @param {string} ip
 * @returns {boolean}
 */
export function unreachableV4(ip) {
  const p = ip.split(".").map(Number);
  const [a = -1, b = -1] = p;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  );
}

/**
 * @param {import("./settings.mjs").TurnSettings} s
 * @returns {Promise<Check>}
 */
async function externalIp(s) {
  const name = "external IP";
  if (s.externalIp === null) return { name, status: "skip", detail: "not set" };
  const pub = s.externalIp.split("/")[0] ?? "";
  if (!net.isIPv4(pub)) return { name, status: "fail", detail: `${pub} is not an IPv4 address` };
  if (unreachableV4(pub)) {
    return {
      name,
      status: "fail",
      detail: `${pub} is private or carrier-grade NAT (100.64/10): the internet cannot reach it`,
    };
  }
  if (s.stunProbe === null)
    return { name, status: "ok", detail: `${pub} (no stunProbe to compare with)` };
  const [host = "", port = "3478"] = s.stunProbe.split(/:(?=\d+$)/);
  try {
    const seen = await binding(host, Number(port), 3000);
    return seen.address === pub
      ? { name, status: "ok", detail: `${pub}, as ${s.stunProbe} sees it` }
      : { name, status: "fail", detail: `set to ${pub}, but ${s.stunProbe} sees ${seen.address}` };
  } catch (e) {
    return {
      name,
      status: "fail",
      detail: `${s.stunProbe}: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}

/**
 * @param {import("./settings.mjs").TurnSettings} s
 * @param {Date} now
 * @returns {Check}
 */
function certificate(s, now) {
  const name = "TLS certificate";
  if (!tls(s) || s.cert === null) return { name, status: "skip", detail: "no TLS configured" };
  let cert;
  try {
    cert = new crypto.X509Certificate(fs.readFileSync(s.cert));
  } catch (e) {
    return {
      name,
      status: "fail",
      detail: `${s.cert}: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
  const days = Math.floor((new Date(cert.validTo).getTime() - now.getTime()) / 86_400_000);
  return {
    name,
    status: days >= CERT_DAYS_MIN ? "ok" : "fail",
    detail: days < 0 ? `expired ${String(-days)} days ago` : `${String(days)} days left`,
  };
}

/** Private peers coturn must refuse; the first that is no own address is asked. */
const PRIVATE_PROBES = ["10.255.255.254", "192.168.255.254", "172.31.255.254"];

/**
 * The peers the permission check asks for (#1266), each with whether it
 * must be granted: a public address (stunProbe's), the host's own public
 * address, so two players on this relay reach each other, and a private
 * address, which must be refused.
 *
 * @param {import("./settings.mjs").TurnSettings} s
 * @param {(host: string) => Promise<string>} lookup  a name's IPv4 address
 * @returns {Promise<{ label: string, peer: string, granted: boolean }[]>}
 */
export async function permissionProbes(s, lookup) {
  const own = ownAddresses(s);
  const priv = PRIVATE_PROBES.find((ip) => !own.includes(ip)) ?? "10.255.255.254";
  const probes = [{ label: "private", peer: priv, granted: false }];
  const pub = s.externalIp?.split("/")[0];
  if (pub !== undefined && net.isIPv4(pub))
    probes.unshift({ label: "own", peer: pub, granted: true });
  if (s.stunProbe !== null) {
    const [host = ""] = s.stunProbe.split(/:(?=\d+$)/);
    probes.unshift({ label: "public", peer: await lookup(host), granted: true });
  }
  return probes;
}

/** @param {string} host */
async function lookupV4(host) {
  return net.isIPv4(host) ? host : (await dns.lookup(host, { family: 4 })).address;
}

/**
 * Whether a relay may reach a public peer and the host's own address, and
 * is refused a private one.
 *
 * @param {import("./settings.mjs").TurnSettings} s
 * @param {string} host
 * @returns {Promise<Check>}
 */
async function permissionCheck(s, host) {
  const name = "permissions";
  try {
    const password = healthPassword(s);
    const probes = await permissionProbes(s, lookupV4);
    const res = await permissions({
      host,
      port: s.listeningPort,
      username: HEALTH_USER,
      password,
      peers: probes.map((p) => p.peer),
    });
    if (!res.ok) {
      const code = res.code === null ? "no code" : String(res.code);
      return { name, status: "fail", detail: `no allocation (${code})` };
    }
    const codes = probes.map((_p, i) => res.answers[i]?.code ?? null);
    const ok = probes.every((p, i) => (codes[i] === null) === p.granted);
    const detail = probes.map((p, i) => {
      const code = codes[i] ?? null;
      const answer = code === null ? "granted" : `refused (${String(code)})`;
      return `${p.label} ${p.peer} ${answer}`;
    });
    return { name, status: ok ? "ok" : "fail", detail: detail.join(", ") };
  } catch (e) {
    return { name, status: "fail", detail: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Whether turn.nft is loaded. Only root can tell; anyone else gets a skip.
 *
 * @returns {Check}
 */
export function nftCheck() {
  const name = "nftables";
  if (process.getuid?.() !== 0) {
    return {
      name,
      status: "skip",
      detail: "cannot tell: not root (nft list table inet vibewars_turn)",
    };
  }
  const res = spawnSync("nft", ["list", "table", "inet", "vibewars_turn"], { encoding: "utf8" });
  if (res.error !== undefined) return { name, status: "skip", detail: "cannot tell: no nft" };
  return res.status === 0
    ? { name, status: "ok", detail: "table inet vibewars_turn is loaded" }
    : {
        name,
        status: "fail",
        detail:
          "table inet vibewars_turn is not loaded: relay users reach this host's UDP services",
      };
}

/**
 * @param {import("./settings.mjs").TurnSettings} s
 * @param {Date} [now]
 * @returns {Promise<Check[]>}
 */
export async function runChecks(s, now = new Date()) {
  const host = checkHost(s);
  const running = serverPid(s);
  /** @type {Check[]} */
  const checks = [
    {
      name: "process",
      status: running.pid === null ? "fail" : "ok",
      detail: running.pid === null ? running.why : `pid ${String(running.pid)}`,
    },
  ];
  try {
    const seen = await binding(host, s.listeningPort);
    checks.push({
      name: "STUN binding",
      status: "ok",
      detail: `${seen.address}:${String(seen.port)}`,
    });
  } catch (e) {
    checks.push({
      name: "STUN binding",
      status: "fail",
      detail: e instanceof Error ? e.message : String(e),
    });
  }
  try {
    const password = healthPassword(s);
    const res = await allocate({ host, port: s.listeningPort, username: HEALTH_USER, password });
    checks.push(
      res.ok
        ? { name: "allocation", status: "ok", detail: `relayed ${res.relayed}` }
        : {
            name: "allocation",
            status: "fail",
            detail: `refused (${res.code === null ? "no code" : String(res.code)})`,
          },
    );
  } catch (e) {
    checks.push({
      name: "allocation",
      status: "fail",
      detail: e instanceof Error ? e.message : String(e),
    });
  }
  checks.push(
    checks.at(-1)?.status === "ok"
      ? await permissionCheck(s, host)
      : { name: "permissions", status: "skip", detail: "no allocation" },
  );
  checks.push(nftCheck());
  checks.push(await externalIp(s));
  checks.push(certificate(s, now));
  return checks;
}

/**
 * @param {readonly Check[]} checks
 * @returns {boolean}
 */
export function healthy(checks) {
  return checks.every((c) => c.status !== "fail");
}
