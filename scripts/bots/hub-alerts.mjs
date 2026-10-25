/**
 * `hub alerts`: the code-scanning alerts on main or on a pull request
 * (#184), so the company can read what CodeQL found.
 *
 * gh has no code-scanning subcommand and `gh api` is refused to agents, so
 * this is a hub verb: hub sends `{ kind: "alerts", argv }`, and hubd makes
 * the one REST read `alertsPath` names. Pure functions only.
 *
 * Alert text is data from analysed code. It is printed, never acted on,
 * and stripped of anything that could fake terminal or mirror output.
 */

/** @typedef {Record<string, unknown>} Json */

/** @typedef {{ pr: number | null, state: "open" | "fixed" | "dismissed", json: boolean }} AlertsPlan */

/**
 * @typedef {{
 *   number: number,
 *   state: string,
 *   severity: string,
 *   rule: string,
 *   path: string,
 *   line: number,
 *   message: string,
 *   url: string,
 * }} AlertRow
 */

/** How many alerts one read returns; a full page says there may be more. */
export const ALERTS_PAGE = 100;

const MESSAGE_CHARS = 120;

const STATES = ["open", "fixed", "dismissed"];

/** Most severe first. Anything unknown sorts last. */
const SEVERITY_ORDER = ["critical", "high", "medium", "low", "error", "warning", "note"];

/**
 * @param {string[]} argv the words after `hub alerts`
 * @returns {AlertsPlan | { error: string }}
 */
export function parseAlerts(argv) {
  /** @type {AlertsPlan} */
  const plan = { pr: null, state: "open", json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const word = argv[i];
    if (word === "--json") {
      plan.json = true;
    } else if (word === "--pr") {
      const value = argv[i + 1] ?? "";
      if (!/^[1-9][0-9]*$/.test(value)) {
        return { error: `--pr needs a pull request number, not "${value}"` };
      }
      plan.pr = Number(value);
      i += 1;
    } else if (word === "--state") {
      const value = argv[i + 1] ?? "";
      if (!STATES.includes(value)) {
        return { error: `--state is one of ${STATES.join(", ")}, not "${value}"` };
      }
      plan.state = /** @type {AlertsPlan["state"]} */ (value);
      i += 1;
    } else {
      return {
        error: `unknown argument "${String(word)}"; usage: hub alerts [--pr <n>] [--state open|fixed|dismissed] [--json]`,
      };
    }
  }
  return plan;
}

/**
 * @param {AlertsPlan} plan
 * @returns {string} the git ref the alerts are on
 */
export function alertsRef(plan) {
  return plan.pr === null ? "refs/heads/main" : `refs/pull/${String(plan.pr)}/merge`;
}

/**
 * @param {AlertsPlan} plan
 * @param {string} repo `owner/name`
 * @returns {string} the REST path to read
 */
export function alertsPath(plan, repo) {
  const ref = encodeURIComponent(alertsRef(plan));
  return `repos/${repo}/code-scanning/alerts?state=${plan.state}&ref=${ref}&per_page=${String(ALERTS_PAGE)}`;
}

/**
 * @param {unknown} value
 * @returns {Json}
 */
function rec(value) {
  return typeof value === "object" && value !== null ? /** @type {Json} */ (value) : {};
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function str(value) {
  return typeof value === "string" ? value : "";
}

/**
 * Controls (ESC, CR and the rest) and invisible format characters (bidi
 * overrides, zero-width and tag characters), removed.
 *
 * @param {string} text
 * @returns {string}
 */
export function stripped(text) {
  return text.replace(/[\p{Cc}\p{Cf}]|\u115f|\u1160|\u3164|\uffa0|[\u{e0100}-\u{e01ef}]/gu, "");
}

/**
 * The first line of an alert's message, stripped and cut to 120 characters.
 *
 * @param {string} text
 * @returns {string}
 */
function messageLine(text) {
  const first = stripped(text.split(/\r?\n/)[0] ?? "");
  // By grapheme, so a cut never splits an emoji or a letter from its accent.
  const chars = Array.from(new Intl.Segmenter().segment(first), (part) => part.segment);
  return chars.length > MESSAGE_CHARS ? `${chars.slice(0, MESSAGE_CHARS - 1).join("")}…` : first;
}

/**
 * GitHub's alert objects, as rows. Total over missing fields: an alert with
 * no location has path "" and line 0.
 *
 * @param {unknown} raw the parsed REST answer
 * @returns {AlertRow[]}
 */
export function alertRows(raw) {
  const list = Array.isArray(raw) ? raw : [];
  return list.map((entry) => {
    const alert = rec(entry);
    const rule = rec(alert.rule);
    const instance = rec(alert.most_recent_instance);
    const location = rec(instance.location);
    const line = location.start_line;
    return {
      number: typeof alert.number === "number" ? alert.number : 0,
      state: stripped(str(alert.state)),
      severity: stripped(str(rule.security_severity_level) || str(rule.severity)),
      rule: stripped(str(rule.id)),
      path: stripped(str(location.path)),
      line: typeof line === "number" ? line : 0,
      message: messageLine(str(rec(instance.message).text)),
      url: stripped(str(alert.html_url)),
    };
  });
}

/**
 * @param {string} severity
 * @returns {number}
 */
function rank(severity) {
  const at = SEVERITY_ORDER.indexOf(severity);
  return at === -1 ? SEVERITY_ORDER.length : at;
}

/**
 * What `hub alerts` prints: most severe first, then by number.
 *
 * @param {AlertRow[]} rows
 * @param {AlertsPlan} plan
 * @returns {string}
 */
export function renderAlerts(rows, plan) {
  const sorted = [...rows].sort(
    (a, b) => rank(a.severity) - rank(b.severity) || a.number - b.number,
  );
  const full = rows.length >= ALERTS_PAGE;
  if (plan.json) {
    return `${JSON.stringify(sorted, null, 2)}\n`;
  }
  const ref = alertsRef(plan);
  if (sorted.length === 0) {
    return `no ${plan.state} code-scanning alerts on ${ref}\n`;
  }
  const number = Math.max(...sorted.map((row) => `#${String(row.number)}`.length));
  const severity = Math.max(...sorted.map((row) => row.severity.length));
  const rule = Math.max(...sorted.map((row) => row.rule.length));
  const lines = sorted.map((row) =>
    [
      `#${String(row.number)}`.padEnd(number),
      row.severity.padEnd(severity),
      row.rule.padEnd(rule),
      `${row.path}:${String(row.line)}`,
      row.message,
    ].join("  "),
  );
  const count = `${String(sorted.length)} ${plan.state} alert${sorted.length === 1 ? "" : "s"} on ${ref}`;
  return `${[...lines, full ? `${count} (first ${String(ALERTS_PAGE)} shown)` : count].join("\n")}\n`;
}

/**
 * What a failed read says. Never "no alerts".
 *
 * @param {number} code gh's exit code
 * @param {string} stderr gh's stderr
 * @param {AlertsPlan} plan
 * @returns {string}
 */
export function alertsFailure(code, stderr, plan) {
  const first = stripped(stderr.trim().split(/\r?\n/)[0] ?? "");
  if (/HTTP 404|no analysis found/i.test(stderr)) {
    return `CodeQL has not analysed ${alertsRef(plan)} yet\n`;
  }
  if (stderr.includes("HTTP 403")) {
    return `${first}\nthe company token cannot read code scanning; ask the operator\n`;
  }
  return `${first || `gh exited ${String(code)}`}\n`;
}
