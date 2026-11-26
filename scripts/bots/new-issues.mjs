/**
 * New issues for the manager to rank (#550): when a colleague files an issue
 * through hub, hubd collects it here and, a minute after the first, tells the
 * manager about the lot in one message, instead of leaving it for the next
 * groom.
 *
 * Pure: hubd keeps the clock and sends the message. The queue lives in
 * memory only; a restart drops it, and the groom nudge (#537) catches what
 * it held.
 */

/** How long a batch collects after its first issue. */
export const WINDOW_MS = 60_000;

/** The longest title the message carries. */
export const MAX_TITLE = 60;

/**
 * @typedef {object} NewIssue
 * @property {number} number
 * @property {string} title "" when the caller gave none
 * @property {boolean} landed false when #517 could not put it in Backlog
 */

/**
 * @param {{ windowMs?: number }} [options]
 * @returns {{ add: (issue: NewIssue, now: number) => void, take: (now: number) => NewIssue[] }}
 */
export function createIssueBatch({ windowMs = WINDOW_MS } = {}) {
  /** @type {NewIssue[]} */
  let queued = [];
  let firstAddedAt = 0;
  return {
    add(issue, now) {
      if (queued.length === 0) {
        firstAddedAt = now;
      }
      queued.push(issue);
    },
    take(now) {
      if (queued.length === 0 || now < firstAddedAt + windowMs) {
        return [];
      }
      const taken = queued;
      queued = [];
      return taken;
    },
  };
}

/**
 * @param {NewIssue} issue
 * @returns {string}
 */
function label(issue) {
  const title =
    issue.title.length > MAX_TITLE ? `${issue.title.slice(0, MAX_TITLE - 1)}…` : issue.title;
  return title === "" ? `#${String(issue.number)}` : `#${String(issue.number)} ${title}`;
}

/**
 * The one message to the manager about a batch. An issue #517 could not
 * land is named with what to do about it instead.
 *
 * @param {readonly NewIssue[]} issues at least one
 * @returns {string}
 */
export function newIssueMessage(issues) {
  const landed = issues.filter((issue) => issue.landed);
  const unlanded = issues
    .filter((issue) => !issue.landed)
    .map((issue) => `${label(issue)} is not on the board: add it.`);
  /** @type {string[]} */
  const parts = [];
  if (landed.length === 1 && landed[0] !== undefined) {
    parts.push(`${label(landed[0])} is new in Backlog: rank it.`);
  } else if (landed.length > 1) {
    parts.push(
      `${String(landed.length)} new in Backlog, rank them: ${landed.map(label).join("; ")}`,
    );
  }
  return [...parts, ...unlanded].join(" ");
}
