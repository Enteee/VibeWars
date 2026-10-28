/**
 * The numbers turn-dash shows (#974): coturn's Prometheus counters, and an
 * approximate live throughput from the server's own I/O.
 *
 * coturn's `turn_total_traffic_*` count finished sessions only, so they are
 * no use for "now". Counting packets on the relay ports would need nftables,
 * and devenv never has root, so live throughput is the turnserver process's
 * `rchar`/`wchar` deltas from /proc: every socket read and write, control
 * traffic and the log file included. Hence "approx.".
 */
import fs from "node:fs";

/**
 * Prometheus text exposition, each metric summed over its labels.
 *
 * @param {string} text
 * @returns {Map<string, number>}
 */
export function parsePrometheus(text) {
  /** @type {Map<string, number>} */
  const out = new Map();
  for (const line of text.split("\n")) {
    if (line === "" || line.startsWith("#")) continue;
    const m = /^([A-Za-z_:][A-Za-z0-9_:]*)(\{[^}]*\})?\s+(\S+)/.exec(line);
    if (m === null) continue;
    const value = Number(m[3]);
    if (!Number.isFinite(value)) continue;
    const name = /** @type {string} */ (m[1]);
    out.set(name, (out.get(name) ?? 0) + value);
  }
  return out;
}

/**
 * @param {number} port
 * @returns {Promise<Map<string, number> | null>}  null when the endpoint does not answer
 */
export async function scrape(port) {
  try {
    const res = await fetch(`http://127.0.0.1:${String(port)}/metrics`, {
      signal: AbortSignal.timeout(1500),
    });
    return res.ok ? parsePrometheus(await res.text()) : null;
  } catch {
    return null;
  }
}

/**
 * A process's I/O counters, or null where there is no /proc (macOS) or no
 * such process.
 *
 * @param {number} pid
 * @returns {{ rchar: number, wchar: number } | null}
 */
export function procIo(pid) {
  let text;
  try {
    text = fs.readFileSync(`/proc/${String(pid)}/io`, "utf8");
  } catch {
    return null;
  }
  return parseProcIo(text);
}

/**
 * @param {string} text  the contents of /proc/<pid>/io
 * @returns {{ rchar: number, wchar: number } | null}
 */
export function parseProcIo(text) {
  const field = (/** @type {string} */ name) => {
    const m = new RegExp(`^${name}:\\s*(\\d+)$`, "m").exec(text);
    return m === null ? null : Number(m[1]);
  };
  const rchar = field("rchar");
  const wchar = field("wchar");
  return rchar === null || wchar === null ? null : { rchar, wchar };
}

/**
 * Per-second rate between two samples of a counter. A counter that went
 * down (the server restarted) has no rate yet.
 *
 * @param {number | undefined} before
 * @param {number | undefined} after
 * @param {number} seconds
 * @returns {number | null}
 */
export function rate(before, after, seconds) {
  if (before === undefined || after === undefined || seconds <= 0 || after < before) return null;
  return (after - before) / seconds;
}

/**
 * @param {number} bytes
 * @returns {string}
 */
export function formatBytes(bytes) {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let v = bytes;
  let u = 0;
  while (v >= 1000 && u < units.length - 1) {
    v /= 1000;
    u += 1;
  }
  return `${u === 0 ? String(Math.round(v)) : v.toFixed(1)} ${units[u] ?? "B"}`;
}
