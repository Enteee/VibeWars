/**
 * turn-check (#974): is the TURN server up and usable from the internet?
 * Each check is ok, fail or skip (not configured); healthy is no fail.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import net from "node:net";

import { files, tls } from "./settings.mjs";
import { allocate, binding } from "./stun.mjs";
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
