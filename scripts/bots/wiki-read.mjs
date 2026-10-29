/**
 * The worker `readPage` (wiki.mjs) runs a page's text or a diff in (#1380).
 * The page is untrusted bytes and its parsing is regular expressions, so it
 * runs here, off hubd's thread, where a slow one can be killed.
 */

import { parentPort, workerData } from "node:worker_threads";

import { extractText, unifiedDiff } from "./wiki.mjs";

/** @type {unknown} */
const data = workerData;
const job = /** @type {import("./wiki.mjs").ReadJob} */ (data);

/** @type {import("./wiki.mjs").ReadAnswer} */
let answer;
if (job.verb === "text") {
  answer = { ok: true, text: extractText(job.html) };
} else {
  const diff = unifiedDiff(extractText(job.from), extractText(job.to), job.fromLabel, job.toLabel);
  answer = diff.ok ? { ok: true, text: diff.diff ?? "no change" } : diff;
}
parentPort?.postMessage(answer);
