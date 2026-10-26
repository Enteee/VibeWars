/**
 * `hub watch` (#736): an agent asks once, carries on, and hubd drops one
 * message in its inbox when CI on a pull request's head has finished.
 *
 * The pure half: the words, the watches file, what a poll found and what
 * the message says. hubd does the reading and the delivering. A watch is of
 * a fixed kind, never a command: hubd holds the GitHub credential, and runs
 * nothing an agent wrote.
 */

/** No watch outlives this: a run that never ends still gets an answer. */
export const WATCH_CAP_MS = 90 * 60_000;

/** The most lines of a failing e2e job's log a message carries. */
export const EXCERPT_LINES = 40;

/** The most failing specs a message names, per job. */
const MAX_SPECS = 20;

const USAGE = "usage: hub watch ci <pr> [--note <text>] | hub watch ls | hub watch rm <id>";

/**
 * @typedef {object} Watch
 * @property {string} id
 * @property {string} employee who asked, and whose inbox the answer goes to
 * @property {"ci"} kind
 * @property {number} pr
 * @property {string} sha the head being watched
 * @property {string | null} note said back verbatim with the answer
 * @property {number} created epoch ms
 */

/**
 * The words after `hub watch`.
 *
 * @param {string[]} argv
 * @returns {{ verb: "ci", pr: number, note: string | null } | { verb: "ls" } | { verb: "rm", id: string } | { error: string }}
 */
export function parseWatchRequest(argv) {
  const [verb, target, ...rest] = argv;
  if (verb === "ls" && target === undefined) {
    return { verb: "ls" };
  }
  if (verb === "rm" && target !== undefined && rest.length === 0) {
    return { verb: "rm", id: target };
  }
  if (verb === "ci" && target !== undefined && /^[1-9]\d{0,8}$/.test(target)) {
    if (rest.length === 0) {
      return { verb: "ci", pr: Number(target), note: null };
    }
    const [flag, ...note] = rest;
    if (flag === "--note" && note.length > 0 && note.join(" ").trim() !== "") {
      return { verb: "ci", pr: Number(target), note: note.join(" ") };
    }
  }
  return { error: USAGE };
}

/**
 * @param {unknown} value
 * @returns {value is Watch}
 */
function isWatch(value) {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const watch = /** @type {Record<string, unknown>} */ (value);
  return (
    typeof watch.id === "string" &&
    typeof watch.employee === "string" &&
    watch.kind === "ci" &&
    typeof watch.pr === "number" &&
    Number.isInteger(watch.pr) &&
    typeof watch.sha === "string" &&
    /^[0-9a-f]{7,40}$/.test(watch.sha) &&
    (watch.note === null || typeof watch.note === "string") &&
    typeof watch.created === "number"
  );
}

/**
 * The watches file as hubd wrote it. One in any other shape is discarded
 * whole (CLAUDE.md), and whoever it names is told once.
 *
 * @param {string} text
 * @returns {{ watches: Watch[] } | { malformed: true, owners: string[] }}
 */
export function parseWatches(text) {
  /** @type {unknown} */
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { malformed: true, owners: [] };
  }
  /** @type {unknown[]} */
  const entries = Array.isArray(parsed) ? parsed : [];
  if (Array.isArray(parsed) && entries.every(isWatch)) {
    return { watches: entries };
  }
  const owners = entries
    .map((entry) =>
      typeof entry === "object" && entry !== null
        ? /** @type {Record<string, unknown>} */ (entry).employee
        : undefined,
    )
    .filter((owner) => typeof owner === "string");
  return { malformed: true, owners: [...new Set(owners)] };
}

/**
 * One line per watch, for `hub watch ls`.
 *
 * @param {Watch[]} watches the asking employee's own
 * @param {number} now
 * @returns {string}
 */
export function listWatches(watches, now) {
  if (watches.length === 0) {
    return "no watches\n";
  }
  return watches
    .map((watch) => {
      const minutes = Math.floor((now - watch.created) / 60_000);
      const note = watch.note === null ? "" : `  note: ${watch.note}`;
      return `${watch.id}  ci #${String(watch.pr)} @ ${watch.sha.slice(0, 7)}  ${String(minutes)} min${note}\n`;
    })
    .join("");
}

/**
 * The open pull requests whose body closes issue `issue` (pr-closes skill),
 * by any of GitHub's closing keywords.
 *
 * @param {unknown} pulls REST `pulls?state=open`
 * @param {number} issue
 * @returns {{ number: number, sha: string }[] | null} `null` if the answer is not a list of pulls
 */
export function closingPulls(pulls, issue) {
  if (!Array.isArray(pulls)) {
    return null;
  }
  const closes = new RegExp(
    `\\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?):?\\s+#${String(issue)}(?!\\d)`,
    "i",
  );
  /** @type {{ number: number, sha: string }[]} */
  const found = [];
  for (const raw of /** @type {unknown[]} */ (pulls)) {
    const pull = /** @type {Record<string, unknown>} */ (
      typeof raw === "object" && raw !== null ? raw : {}
    );
    const head = /** @type {Record<string, unknown>} */ (
      typeof pull.head === "object" && pull.head !== null ? pull.head : {}
    );
    if (
      typeof pull.number !== "number" ||
      typeof head.sha !== "string" ||
      typeof pull.body !== "string"
    ) {
      continue;
    }
    if (closes.test(pull.body)) {
      found.push({ number: pull.number, sha: head.sha });
    }
  }
  return found;
}

/** A GitHub log line's timestamp, which every line of a job's log starts with. */
const STAMP = /^\d{4}-\d{2}-\d{2}T[\d:.]+Z ?/;

/** Playwright's heading for one failed test: `  1) [chromium] › e2e/a.spec.ts:12:3 › title ───`. */
const FAILED_SPEC = /^\s*\d+\)\s+\[[^\]]+\]\s+›\s+(\S+?:\d+)(?::\d+)?\s+›\s+([^─]+?)\s*(?:─.*)?$/;

/**
 * What an e2e job's log says failed: each spec once, as `file:line › title`,
 * and the first failure's lines, bounded.
 *
 * @param {string} log
 * @returns {{ specs: string[], excerpt: string[] }}
 */
export function failedSpecs(log) {
  const lines = log.split("\n").map((line) => line.replace(STAMP, "").trimEnd());
  /** @type {string[]} */
  const specs = [];
  let first = -1;
  lines.forEach((line, index) => {
    const match = FAILED_SPEC.exec(line);
    if (match === null) {
      return;
    }
    if (first === -1) {
      first = index;
    }
    const spec = `${match[1] ?? ""} › ${match[2] ?? ""}`;
    if (!specs.includes(spec)) {
      specs.push(spec);
    }
  });
  return {
    specs: specs.slice(0, MAX_SPECS),
    excerpt: first === -1 ? [] : lines.slice(first, first + EXCERPT_LINES),
  };
}

/**
 * @typedef {object} FailedJob
 * @property {string} name
 * @property {string | null} conclusion
 * @property {{ specs: string[], excerpt: string[] } | null} log what its log said, for an e2e job
 */

/**
 * The one message a finished watch sends.
 *
 * @param {Watch} watch
 * @param {{ pass: true } | { pass: false, reason: string, failed: FailedJob[] }} verdict
 * @returns {string}
 */
export function ciMessage(watch, verdict) {
  const head = `CI on #${String(watch.pr)} @ ${watch.sha.slice(0, 7)}`;
  const lines = verdict.pass ? [`${head}: PASS.`] : [`${head}: FAIL. ${verdict.reason}`];
  if (!verdict.pass) {
    for (const job of verdict.failed) {
      lines.push(`- ${job.name} (${String(job.conclusion)})`);
      for (const spec of job.log?.specs ?? []) {
        lines.push(`  ${spec}`);
      }
      const excerpt = job.log?.excerpt ?? [];
      if (excerpt.length > 0) {
        lines.push("  ```", ...excerpt.map((line) => `  ${line}`), "  ```");
      }
    }
  }
  return withNote(lines.join("\n"), watch);
}

/**
 * The message for a watch that ended without a verdict.
 *
 * @param {Watch} watch
 * @param {"merged" | "closed" | "cap"} why
 * @returns {string}
 */
export function endedMessage(watch, why) {
  const target = `#${String(watch.pr)} @ ${watch.sha.slice(0, 7)}`;
  const text =
    why === "cap"
      ? `CI on ${target} did not finish within ${String(WATCH_CAP_MS / 60_000)} min; stopped watching.`
      : `#${String(watch.pr)} was ${why}; stopped watching CI on ${target}.`;
  return withNote(text, watch);
}

/**
 * The message for a push that replaced the watched head.
 *
 * @param {Watch} watch the watch as it was
 * @param {string} sha the new head
 * @returns {string}
 */
export function supersededMessage(watch, sha) {
  return `CI on #${String(watch.pr)} @ ${watch.sha.slice(0, 7)}: superseded by ${sha.slice(0, 7)}, watching that.`;
}

/**
 * @param {string} text
 * @param {Watch} watch
 * @returns {string}
 */
function withNote(text, watch) {
  return watch.note === null ? text : `${text}\nnote: ${watch.note}`;
}
