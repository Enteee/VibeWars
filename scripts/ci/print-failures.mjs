// Prints each failed Playwright test's error-context.md and a trace summary
// into the job log (#3386). Nobody in the company can download artifacts, so
// this is the only way a failure's page snapshot gets read. Runs only on
// failure and always exits 0: it must never decide a job's result.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { inflateRawSync } from "node:zlib";

export const MAX_TEST_LINES = 400;
export const MAX_TOTAL_LINES = 3000;
const TRACE_ACTIONS = 30;

/**
 * Reads one file out of a zip: central directory, then stored/deflated data.
 * @param {Buffer} zip
 * @param {string} name
 * @returns {Buffer}
 */
export function readZipEntry(zip, name) {
  let end = zip.length - 22;
  while (end >= 0 && zip.readUInt32LE(end) !== 0x06054b50) end--;
  if (end < 0) throw new Error("not a zip");
  const count = zip.readUInt16LE(end + 10);
  let p = zip.readUInt32LE(end + 16);
  for (let i = 0; i < count; i++) {
    if (zip.readUInt32LE(p) !== 0x02014b50) throw new Error("bad directory");
    const method = zip.readUInt16LE(p + 10);
    const size = zip.readUInt32LE(p + 20);
    const nameLen = zip.readUInt16LE(p + 28);
    const extraLen = zip.readUInt16LE(p + 30);
    const commentLen = zip.readUInt16LE(p + 32);
    const local = zip.readUInt32LE(p + 42);
    if (zip.toString("utf8", p + 46, p + 46 + nameLen) === name) {
      const start = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
      const data = zip.subarray(start, start + size);
      return method === 0 ? data : inflateRawSync(data);
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  throw new Error(`no ${name} in zip`);
}

/**
 * @typedef {{ type?: string, apiName?: string, class?: string, method?: string, startTime: number, params?: { selector?: string, url?: string, expression?: string } }} TraceEvent
 */

/**
 * The last actions of a trace.trace (JSON lines): time, name, target.
 * @param {string} traceText
 * @param {number} [limit]
 * @returns {string[]}
 */
export function traceSummary(traceText, limit = TRACE_ACTIONS) {
  const actions = [];
  for (const line of traceText.split("\n")) {
    if (!line.includes('"before"')) continue;
    /** @type {TraceEvent} */
    let ev;
    try {
      const parsed = /** @type {unknown} */ (JSON.parse(line));
      ev = /** @type {TraceEvent} */ (parsed);
    } catch {
      continue;
    }
    if (ev.type !== "before") continue;
    const p = ev.params ?? {};
    const target = p.selector ?? p.url ?? p.expression ?? "";
    const name = ev.apiName ?? (ev.class ?? "") + "." + (ev.method ?? "");
    actions.push(
      String(Math.round(ev.startTime)) + " " + name + " " + target.slice(0, 200).trimEnd(),
    );
  }
  return actions.slice(-limit);
}

/** @param {string} root */
function failedDirs(root) {
  if (!existsSync(root)) return [];
  return readdirSync(root)
    .map((d) => join(root, d))
    .filter((d) => statSync(d).isDirectory() && existsSync(join(d, "error-context.md")))
    .sort();
}

/**
 * The log lines for one failed test directory, capped.
 * @param {string} dir
 * @param {string} title
 * @returns {string[]}
 */
export function describeFailure(dir, title) {
  const out = [`::group::${title}`, readFileSync(join(dir, "error-context.md"), "utf8").trimEnd()];
  const tracePath = join(dir, "trace.zip");
  if (existsSync(tracePath)) {
    try {
      const trace = readZipEntry(readFileSync(tracePath), "trace.trace").toString("utf8");
      out.push("--- last actions (ms, action, target) ---", ...traceSummary(trace));
    } catch {
      out.push("trace unreadable");
    }
  } else {
    out.push("trace unreadable");
  }
  const lines = out.join("\n").split("\n");
  const kept = lines.slice(0, MAX_TEST_LINES);
  if (lines.length > kept.length)
    kept.push("... " + String(lines.length - kept.length) + " lines cut");
  kept.push("::endgroup::");
  return kept;
}

/**
 * @param {string} [root]
 * @returns {string[]}
 */
export function printFailures(root = "test-results") {
  const dirs = failedDirs(root);
  if (dirs.length === 0) return ["no failed test left an error-context.md"];
  const all = dirs.flatMap((d) => describeFailure(d, d.slice(root.length + 1)));
  if (all.length <= MAX_TOTAL_LINES) return all;
  return [
    ...all.slice(0, MAX_TOTAL_LINES),
    "... " + String(all.length - MAX_TOTAL_LINES) + " lines cut",
  ];
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  try {
    console.log(printFailures(process.argv[2]).join("\n"));
  } catch (e) {
    console.log(`print-failures: ${e instanceof Error ? e.message : String(e)}`);
  }
}
