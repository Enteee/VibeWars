/**
 * GitHub's rate limit, as hubd spends it.
 *
 * The company shares one GitHub user, and every token of a user shares that
 * user's 5,000-point hourly GraphQL budget. REST has a separate bucket we
 * barely touch. When GraphQL runs out, `gh` does not always say so: `gh
 * project` reports it as "unknown owner type", which every agent then retries
 * into the wall. So hubd asks GitHub's free `rate_limit` endpoint after a
 * GraphQL-bound failure, and while the budget is empty answers every such
 * request at once with when to come back.
 *
 * Pure functions only, so the decisions are tested without a network.
 */

/**
 * `gh` command groups that talk GraphQL. `run`, `workflow` and `api <rest
 * path>` use REST and keep working while GraphQL is exhausted, so they are
 * deliberately absent: blocking them would stop the one thing that still works.
 */
const GRAPHQL_GROUPS = new Set(["issue", "pr", "project", "label", "repo", "release"]);

/**
 * Whether a hub request will spend GraphQL budget.
 *
 * @param {string} kind
 * @param {string[]} argv
 * @returns {boolean}
 */
export function usesGraphql(kind, argv) {
  if (kind === "push") {
    return false;
  }
  // A review is recorded locally and mirrored as a PR comment.
  if (kind === "review") {
    return true;
  }
  const [group, sub] = argv;
  if (group === "api") {
    return sub === "graphql";
  }
  return group !== undefined && GRAPHQL_GROUPS.has(group);
}

/**
 * The GraphQL bucket out of `gh api rate_limit`, or `null` if the answer is
 * not one.
 *
 * @param {string} json
 * @returns {{ limit: number, remaining: number, resetAt: number } | null}
 */
export function parseRateLimit(json) {
  /** @type {unknown} */
  let parsed;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }
  const resources =
    typeof parsed === "object" && parsed !== null
      ? /** @type {Record<string, unknown>} */ (parsed).resources
      : undefined;
  const graphql =
    typeof resources === "object" && resources !== null
      ? /** @type {Record<string, unknown>} */ (resources).graphql
      : undefined;
  if (typeof graphql !== "object" || graphql === null) {
    return null;
  }
  const { limit, remaining, reset } = /** @type {Record<string, unknown>} */ (graphql);
  if (typeof limit !== "number" || typeof remaining !== "number" || typeof reset !== "number") {
    return null;
  }
  // GitHub gives the reset as epoch seconds.
  return { limit, remaining, resetAt: reset * 1000 };
}

/**
 * `HH:MM` local time, which is what a person on a phone can act on.
 *
 * @param {number} at epoch milliseconds
 * @returns {string}
 */
export function clock(at) {
  const time = new Date(at);
  return `${String(time.getHours()).padStart(2, "0")}:${String(time.getMinutes()).padStart(2, "0")}`;
}

/**
 * What an agent is told instead of GitHub's own, often misleading, error.
 *
 * @param {number} resetAt epoch milliseconds
 * @returns {string}
 */
export function limitedMessage(resetAt) {
  return (
    `hub: GitHub is rate-limited until ${clock(resetAt)} (GraphQL budget used up). ` +
    "Work offline until then (read the repo, write code, run tests) and retry after. " +
    "Retrying sooner only waits again.\n"
  );
}

/**
 * Whether a request is a board read the shared snapshot can answer: the JSON
 * item list of the company's own project. A table-format list, or one of
 * another project, goes to GitHub as asked.
 *
 * @param {string[]} argv
 * @param {number} project
 * @returns {boolean}
 */
export function isBoardRead(argv, project) {
  const [group, sub, number] = argv;
  if (group !== "project" || sub !== "item-list" || number !== String(project)) {
    return false;
  }
  const format = argv.indexOf("--format");
  return format !== -1 && argv[format + 1] === "json";
}

/**
 * The board ids `claude-llc-init` recorded, as `board` receives them in
 * `VIBEWARS_BOARD`, or `null` if they are missing or incomplete.
 *
 * @param {string | undefined} json
 * @returns {{ projectId: string, fieldId: string, options: Map<string, string> } | null}
 */
export function parseBoardIds(json) {
  if (json === undefined || json === "") {
    return null;
  }
  /** @type {unknown} */
  let parsed;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }
  const record =
    typeof parsed === "object" && parsed !== null
      ? /** @type {Record<string, unknown>} */ (parsed)
      : {};
  const field =
    typeof record.statusField === "object" && record.statusField !== null
      ? /** @type {Record<string, unknown>} */ (record.statusField)
      : {};
  const options =
    typeof field.options === "object" && field.options !== null
      ? Object.entries(/** @type {Record<string, unknown>} */ (field.options))
      : [];
  if (
    typeof record.projectId !== "string" ||
    record.projectId === "" ||
    typeof field.id !== "string" ||
    field.id === "" ||
    options.length === 0
  ) {
    return null;
  }
  /** @type {Map<string, string>} */
  const byName = new Map();
  for (const [name, id] of options) {
    if (typeof id === "string" && id !== "") {
      byName.set(name, id);
    }
  }
  return { projectId: record.projectId, fieldId: field.id, options: byName };
}
