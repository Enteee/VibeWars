/**
 * Where the GraphQL budget goes (#97).
 *
 * The company shares one 5,000-point hourly GraphQL budget, and ran it out
 * more than once. Guessing at the cause had already been tried, so hubd
 * now writes down every GraphQL-bound call it makes: who asked, which
 * command, how long it took, and what it cost. The last hour of that lives
 * in `ratelimit.json`, and the dashboard shows the top spenders.
 *
 * A cost comes from one of two places. hubd's own hand-written queries ask
 * for `rateLimit { cost }`, which is exact. Anything else gh sends is
 * measured as the drop in `remaining` across the call, read from the free
 * `rate_limit` endpoint. That is exact too as long as nothing else spends
 * at the same time, which holds because hubd serves one request at a time;
 * the operator's own gh is the one thing that can blur it, so the dashboard
 * marks these costs as approximate.
 *
 * Pure functions only, so the arithmetic is tested without a network.
 */

/** How long a call stays in the window the dashboard reports. */
export const SPEND_WINDOW_MS = 3_600_000;

/**
 * One GraphQL-bound call.
 *
 * @typedef {object} Spend
 * @property {number} at epoch ms when it finished
 * @property {string} role who asked; `hubd` for its own housekeeping
 * @property {string} cmd e.g. `pr checks`, or `board snapshot`
 * @property {number} ms how long it took
 * @property {number | null} cost points, or `null` when it could not be told
 */

/**
 * The window with `spend` added and anything older than an hour dropped.
 *
 * @param {readonly Spend[]} window
 * @param {Spend} spend
 * @param {number} now
 * @returns {Spend[]}
 */
export function recordSpend(window, spend, now) {
  return [...window, spend].filter((entry) => now - entry.at < SPEND_WINDOW_MS);
}

/**
 * The GraphQL bucket at one moment, as `rate_limit` or `rateLimit` gives it.
 *
 * @typedef {object} Budget
 * @property {number} remaining
 * @property {number} resetAt epoch ms
 */

/**
 * What a call cost, from the budget before and after it, or `null` if the
 * two readings cannot be compared: the hour reset in between, or the budget
 * went up, which only a reset does.
 *
 * @param {Budget | null} before
 * @param {Budget | null} after
 * @returns {number | null}
 */
export function costBetween(before, after) {
  if (before === null || after === null) {
    return null;
  }
  if (before.resetAt !== after.resetAt) {
    return null;
  }
  const cost = before.remaining - after.remaining;
  return cost >= 0 ? cost : null;
}

/**
 * The window summed up: points spent, calls made, every command by cost,
 * largest first, then by count, and every role by the points it counted
 * (#963), largest first.
 *
 * @typedef {object} SpendSummary
 * @property {number} spent
 * @property {number} calls
 * @property {number} unknown calls whose cost could not be told
 * @property {{ cmd: string, count: number, cost: number }[]} top
 * @property {{ role: string, points: number }[]} byRole only roles that
 *   counted a point
 *
 * @param {readonly Spend[]} window
 * @returns {SpendSummary}
 */
export function summarizeSpend(window) {
  /** @type {Map<string, { cmd: string, count: number, cost: number }>} */
  const byCmd = new Map();
  /** @type {Map<string, number>} */
  const points = new Map();
  let spent = 0;
  let unknown = 0;
  for (const { role, cmd, cost } of window) {
    const row = byCmd.get(cmd) ?? { cmd, count: 0, cost: 0 };
    row.count += 1;
    if (cost === null) {
      unknown += 1;
    } else {
      row.cost += cost;
      spent += cost;
      points.set(role, (points.get(role) ?? 0) + cost);
    }
    byCmd.set(cmd, row);
  }
  const top = [...byCmd.values()].sort((a, b) => b.cost - a.cost || b.count - a.count);
  const byRole = [...points]
    .filter(([, sum]) => sum > 0)
    .map(([role, sum]) => ({ role, points: sum }))
    .sort((a, b) => b.points - a.points);
  return { spent, calls: window.length, unknown, top, byRole };
}

/**
 * The `spend` list out of `ratelimit.json`; an entry not in the current
 * shape is skipped.
 *
 * @param {unknown} value
 * @returns {Spend[]}
 */
export function readSpend(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  /** @type {Spend[]} */
  const window = [];
  for (const raw of value) {
    const entry = obj(raw);
    if (
      typeof entry.at === "number" &&
      typeof entry.role === "string" &&
      typeof entry.cmd === "string" &&
      typeof entry.ms === "number" &&
      (typeof entry.cost === "number" || entry.cost === null)
    ) {
      window.push({
        at: entry.at,
        role: entry.role,
        cmd: entry.cmd,
        ms: entry.ms,
        cost: entry.cost,
      });
    }
  }
  return window;
}

/* -------------------------------------------------------------------------- */
/* The board snapshot                                                         */
/* -------------------------------------------------------------------------- */

/**
 * The board, one page at a time, selecting only what `board`, the
 * visibility filter and the dashboard read. `gh project item-list` fetches
 * every field value of every item instead. How seldom hubd needs it is
 * hub-board.mjs's business.
 */
export const BOARD_QUERY = `query($project: ID!, $cursor: String) {
  rateLimit { cost remaining resetAt }
  node(id: $project) {
    ... on ProjectV2 {
      items(first: 100, after: $cursor) {
        totalCount
        pageInfo { hasNextPage endCursor }
        nodes {
          id
          status: fieldValueByName(name: "Status") {
            ... on ProjectV2ItemFieldSingleSelectValue { name }
          }
          content {
            __typename
            ... on Issue { number title url repository { nameWithOwner } }
            ... on PullRequest { number title url repository { nameWithOwner } }
            ... on DraftIssue { title }
          }
        }
      }
    }
  }
}`;

/**
 * @param {unknown} value
 * @returns {Record<string, unknown>}
 */
function obj(value) {
  return typeof value === "object" && value !== null
    ? /** @type {Record<string, unknown>} */ (value)
    : {};
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function str(value) {
  return typeof value === "string" ? value : "";
}

/**
 * One page of BOARD_QUERY's answer, or `null` if it is not one.
 *
 * @param {string} json
 * @returns {{
 *   items: Record<string, unknown>[],
 *   totalCount: number,
 *   next: string | null,
 *   cost: number | null,
 *   budget: Budget | null,
 * } | null}
 */
export function parseBoardPage(json) {
  /** @type {unknown} */
  let parsed;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }
  const data = obj(obj(parsed).data);
  const page = obj(obj(data.node).items);
  if (!Array.isArray(page.nodes) || typeof page.totalCount !== "number") {
    return null;
  }
  const info = obj(page.pageInfo);
  return {
    items: page.nodes.map((node) => boardItem(obj(node))),
    totalCount: page.totalCount,
    next: info.hasNextPage === true && typeof info.endCursor === "string" ? info.endCursor : null,
    ...parseBudget(data.rateLimit),
  };
}

/**
 * What a hand-written query's `rateLimit { cost remaining resetAt }` says.
 *
 * @param {unknown} rateLimit
 * @returns {{ cost: number | null, budget: Budget | null }}
 */
export function parseBudget(rateLimit) {
  const limit = obj(rateLimit);
  const resetAt = Date.parse(str(limit.resetAt));
  return {
    cost: typeof limit.cost === "number" ? limit.cost : null,
    budget:
      typeof limit.remaining === "number" && Number.isFinite(resetAt)
        ? { remaining: limit.remaining, resetAt }
        : null,
  };
}

/**
 * One item in the shape `gh project item-list --format json` gives it, cut
 * down to the fields anything here reads: `id`, `title`, `status`, and
 * `content` with `type`, `number`, `title`, `url` and `repository` as
 * `owner/name`. A field with no value is left out, as gh leaves it out.
 *
 * @param {Record<string, unknown>} node
 * @returns {Record<string, unknown>}
 */
export function boardItem(node) {
  const raw = obj(node.content);
  /** @type {Record<string, unknown>} */
  const content = { type: str(raw.__typename) };
  if (typeof raw.number === "number") {
    content.number = raw.number;
  }
  content.title = str(raw.title);
  if (typeof raw.url === "string") {
    content.url = raw.url;
  }
  const repository = obj(raw.repository).nameWithOwner;
  if (typeof repository === "string") {
    content.repository = repository;
  }
  /** @type {Record<string, unknown>} */
  const item = { id: str(node.id), title: content.title, content };
  const status = obj(node.status).name;
  if (typeof status === "string") {
    item.status = status;
  }
  return item;
}
