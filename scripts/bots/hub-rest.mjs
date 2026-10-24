/**
 * Serving `gh issue|pr view|list` from GitHub's REST API.
 *
 * Every `gh issue` and `gh pr` subcommand is GraphQL, and the company's whole
 * GraphQL budget is 5,000 points an hour, shared by every agent and the
 * operator. REST is a separate 5,000-request bucket that sits almost unused.
 * The reads agents make all day can be answered from REST just as well, so
 * hubd translates the common forms (issue #17, item 7).
 *
 * The rule that keeps this safe: translate only what can be answered
 * exactly, and hand everything else to `gh` unchanged. A plan function
 * returns `null` for any flag, selector or field it does not know, and that
 * request goes to GraphQL as before. Fields with no REST equivalent, such as
 * `reviewDecision` and `statusCheckRollup`, are deliberately absent.
 *
 * Pure functions only. hubd does the fetching.
 */

/** @typedef {Record<string, unknown>} Json */

/**
 * @param {unknown} value
 * @returns {Json}
 */
function rec(value) {
  return typeof value === "object" && value !== null ? /** @type {Json} */ (value) : {};
}

/**
 * @param {unknown} value
 * @returns {unknown[]}
 */
function arr(value) {
  return Array.isArray(value) ? value : [];
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function str(value) {
  return typeof value === "string" ? value : "";
}

/** @param {unknown} user */
function login(user) {
  return { login: str(rec(user).login) };
}

/** @param {unknown} labels */
function labelsOf(labels) {
  return arr(labels).map((raw) => {
    const label = rec(raw);
    return {
      id: str(label.node_id),
      name: str(label.name),
      description: str(label.description),
      color: str(label.color),
    };
  });
}

/** @param {unknown} assignees */
function assigneesOf(assignees) {
  return arr(assignees).map(login);
}

/**
 * REST issue comments, in gh's `comments` shape.
 *
 * @param {unknown[]} comments
 * @returns {Json[]}
 */
export function commentsOf(comments) {
  return comments.map((raw) => {
    const comment = rec(raw);
    return {
      author: login(comment.user),
      authorAssociation: str(comment.author_association),
      body: str(comment.body),
      createdAt: str(comment.created_at),
      url: str(comment.html_url),
    };
  });
}

/* -------------------------------------------------------------------------- */
/* Field mapping                                                              */
/* -------------------------------------------------------------------------- */

/**
 * The gh fields REST can answer exactly, per command: the same names, the
 * same nesting, the same values, because agents' scripts parse them.
 *
 * Deliberately absent, so they stay on GraphQL: `author` and `assignees`
 * (gh adds `id`, `is_bot` and `name`, and REST has no name without a
 * lookup per user) and `comments` (gh's comment objects carry reactions,
 * minimisation and edit flags REST does not give). hubd still uses the
 * author internally, for visibility; it is only never handed to an agent as
 * gh's answer. Plain-text output, which no script parses, does use them.
 */
export const VIEW_FIELDS = {
  issue: new Set([
    "number",
    "title",
    "body",
    "state",
    "url",
    "labels",
    "createdAt",
    "updatedAt",
    "closedAt",
  ]),
  pr: new Set([
    "number",
    "title",
    "body",
    "state",
    "url",
    "labels",
    "createdAt",
    "updatedAt",
    "closedAt",
    "mergedAt",
    "isDraft",
    "headRefName",
    "baseRefName",
    "headRefOid",
    "additions",
    "deletions",
    "changedFiles",
    "mergeable",
    "mergeStateStatus",
  ]),
};

/**
 * What a list row can carry, exactly. A REST list item is thinner than a
 * single fetch (no diff stats, no mergeability), and `author`/`assignees`
 * are out for the same reason as in `VIEW_FIELDS`.
 */
export const LIST_FIELDS = {
  issue: new Set([
    "number",
    "title",
    "body",
    "state",
    "url",
    "labels",
    "createdAt",
    "updatedAt",
    "closedAt",
  ]),
  pr: new Set([
    "number",
    "title",
    "body",
    "state",
    "url",
    "labels",
    "createdAt",
    "updatedAt",
    "closedAt",
    "mergedAt",
    "isDraft",
    "headRefName",
    "baseRefName",
    "headRefOid",
  ]),
};

/**
 * A REST issue as gh would describe it.
 *
 * @param {unknown} raw `GET /repos/{o}/{r}/issues/{n}`
 * @param {unknown[]} [comments]
 * @returns {Json}
 */
export function ghIssue(raw, comments) {
  const issue = rec(raw);
  return {
    number: issue.number,
    title: str(issue.title),
    body: str(issue.body),
    state: str(issue.state).toUpperCase(),
    url: str(issue.html_url),
    author: login(issue.user),
    labels: labelsOf(issue.labels),
    assignees: assigneesOf(issue.assignees),
    createdAt: str(issue.created_at),
    updatedAt: str(issue.updated_at),
    closedAt: issue.closed_at ?? null,
    ...(comments === undefined ? {} : { comments: commentsOf(comments) }),
  };
}

/** gh's names for REST's `mergeable`, which is a nullable boolean there. */
function mergeableOf(/** @type {unknown} */ value) {
  return value === true ? "MERGEABLE" : value === false ? "CONFLICTING" : "UNKNOWN";
}

/**
 * A REST pull request as gh would describe it.
 *
 * @param {unknown} raw `GET /repos/{o}/{r}/pulls/{n}`, or one row of the list
 * @param {unknown[]} [comments] its issue comments, which is what gh means
 * @returns {Json}
 */
export function ghPull(raw, comments) {
  const pull = rec(raw);
  const merged = typeof pull.merged_at === "string";
  return {
    number: pull.number,
    title: str(pull.title),
    body: str(pull.body),
    state: merged ? "MERGED" : str(pull.state).toUpperCase(),
    url: str(pull.html_url),
    author: login(pull.user),
    labels: labelsOf(pull.labels),
    assignees: assigneesOf(pull.assignees),
    createdAt: str(pull.created_at),
    updatedAt: str(pull.updated_at),
    closedAt: pull.closed_at ?? null,
    mergedAt: pull.merged_at ?? null,
    isDraft: pull.draft === true,
    headRefName: str(rec(pull.head).ref),
    baseRefName: str(rec(pull.base).ref),
    headRefOid: str(rec(pull.head).sha),
    ...("additions" in pull
      ? {
          additions: pull.additions,
          deletions: pull.deletions,
          changedFiles: pull.changed_files,
          mergeable: mergeableOf(pull.mergeable),
          // REST and gh use the same words, in different case.
          mergeStateStatus: str(pull.mergeable_state).toUpperCase() || "UNKNOWN",
        }
      : {}),
    ...(comments === undefined ? {} : { comments: commentsOf(comments) }),
  };
}

/* -------------------------------------------------------------------------- */
/* Planning                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * @typedef {{
 *   group: "issue" | "pr",
 *   number: number,
 *   fields: string[] | null,
 *   comments: boolean,
 * }} ViewPlan
 */

/**
 * Read `--json` style flags off an argument list.
 *
 * @param {string[]} words everything after the subcommand
 * @param {Set<string>} booleans flags that take no value
 * @param {Set<string>} valued flags that take one
 * @returns {{ positional: string[], flags: Map<string, string[]> } | null}
 */
function parseFlags(words, booleans, valued) {
  /** @type {string[]} */
  const positional = [];
  /** @type {Map<string, string[]>} */
  const flags = new Map();
  for (let i = 0; i < words.length; i += 1) {
    const word = words[i] ?? "";
    if (!word.startsWith("-")) {
      positional.push(word);
      continue;
    }
    const eq = word.indexOf("=");
    const name = eq === -1 ? word : word.slice(0, eq);
    if (booleans.has(name) && eq === -1) {
      flags.set(name, [...(flags.get(name) ?? []), ""]);
      continue;
    }
    if (!valued.has(name)) {
      return null;
    }
    const value = eq === -1 ? words[(i += 1)] : word.slice(eq + 1);
    if (value === undefined) {
      return null;
    }
    flags.set(name, [...(flags.get(name) ?? []), value]);
  }
  return { positional, flags };
}

/**
 * @param {Map<string, string[]>} flags
 * @param {string[]} names aliases of one flag
 * @returns {string | undefined} its last value
 */
function last(flags, names) {
  /** @type {string | undefined} */
  let value;
  for (const name of names) {
    const values = flags.get(name);
    if (values !== undefined) {
      value = values[values.length - 1];
    }
  }
  return value;
}

/**
 * How to answer `gh issue view` / `gh pr view` from REST, or `null` to send
 * it to gh unchanged.
 *
 * Output filters never reach here: `hub` applies them in the jail
 * (hub-filter.mjs), and hubd refuses a request that still has one.
 *
 * @param {string[]} argv
 * @returns {ViewPlan | null}
 */
export function planView(argv) {
  const [group, sub, ...rest] = argv;
  if ((group !== "issue" && group !== "pr") || sub !== "view") {
    return null;
  }
  const parsed = parseFlags(rest, new Set(["--comments", "-c"]), new Set(["--json"]));
  if (parsed?.positional.length !== 1) {
    return null;
  }
  const selector = parsed.positional[0] ?? "";
  // Numbers only. A URL or, for a pull request, a branch name needs a lookup
  // gh already knows how to do.
  if (!/^\d+$/.test(selector)) {
    return null;
  }
  const json = last(parsed.flags, ["--json"]);
  const fields = json === undefined ? null : json.split(",").filter((field) => field !== "");
  if (fields !== null && (fields.length === 0 || fields.some((f) => !VIEW_FIELDS[group].has(f)))) {
    return null;
  }
  return {
    group,
    number: Number(selector),
    fields,
    comments:
      parsed.flags.has("--comments") || parsed.flags.has("-c") || !!fields?.includes("comments"),
  };
}

/**
 * @typedef {{
 *   group: "issue" | "pr",
 *   state: "open" | "closed" | "all",
 *   mergedOnly: boolean,
 *   limit: number,
 *   labels: string[],
 * }} ListPlan
 */

/**
 * How to fetch the rows of `gh issue list` / `gh pr list` from REST, or
 * `null` to send it to gh unchanged.
 *
 * Takes the argv after `prepareList`, which has added the fields visibility
 * needs; so `--json` is always present, and the rows are rendered by hub,
 * not here. Only the fields the agent asked for must be exact: the ones
 * added for visibility never reach it.
 *
 * @param {string[]} argv
 * @param {string[]} requested the agent's own `--json` fields, `[]` for gh's defaults
 * @returns {ListPlan | null}
 */
export function planList(argv, requested) {
  const [group, sub, ...rest] = argv;
  if ((group !== "issue" && group !== "pr") || sub !== "list") {
    return null;
  }
  const parsed = parseFlags(
    rest,
    new Set(),
    new Set(["--json", "--state", "-s", "--limit", "-L", "--label", "-l"]),
  );
  if (parsed?.positional.length !== 0) {
    return null;
  }
  if (requested.some((field) => !LIST_FIELDS[group].has(field))) {
    return null;
  }

  const stateFlag = last(parsed.flags, ["--state", "-s"]) ?? "open";
  /** @type {Record<string, { state: "open" | "closed" | "all", mergedOnly: boolean } | undefined>} */
  const states = {
    open: { state: "open", mergedOnly: false },
    closed: { state: "closed", mergedOnly: false },
    all: { state: "all", mergedOnly: false },
    ...(group === "pr" ? { merged: { state: "closed", mergedOnly: true } } : {}),
  };
  const state = states[stateFlag];
  if (state === undefined) {
    return null;
  }

  const limit = Number(last(parsed.flags, ["--limit", "-L"]) ?? "30");
  // One page. Larger lists are rare enough to leave to gh.
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    return null;
  }

  const labels = [...(parsed.flags.get("--label") ?? []), ...(parsed.flags.get("-l") ?? [])];
  // The pulls endpoint cannot filter by label.
  if (group === "pr" && labels.length > 0) {
    return null;
  }
  // A merged-only list filters after fetching, so one page might not fill
  // the limit with merged rows. gh pages until it does; leave it to gh.
  if (state.mergedOnly) {
    return null;
  }
  return { group, ...state, limit, labels };
}

/**
 * The REST path for a list plan, relative to `repos/{owner}/{repo}`.
 *
 * The issues endpoint also returns pull requests, so `issue list` asks for
 * more than the limit and `listRows` drops them; a page of 100 is GitHub's
 * maximum either way.
 *
 * @param {ListPlan} plan
 * @returns {string}
 */
export function listPath(plan) {
  const query = new URLSearchParams({
    state: plan.state,
    per_page: plan.group === "issue" ? "100" : String(plan.limit),
  });
  if (plan.labels.length > 0) {
    query.set("labels", plan.labels.join(","));
  }
  return `${plan.group === "issue" ? "issues" : "pulls"}?${query.toString()}`;
}

/**
 * gh-shaped rows out of a REST list page.
 *
 * @param {ListPlan} plan
 * @param {unknown} page
 * @returns {Json[]}
 */
export function listRows(plan, page) {
  const rows = arr(page);
  if (plan.group === "pr") {
    return rows.slice(0, plan.limit).map((row) => ghPull(row));
  }
  return rows
    .filter((row) => !("pull_request" in rec(row)))
    .slice(0, plan.limit)
    .map((row) => ghIssue(row));
}

/* -------------------------------------------------------------------------- */
/* Output                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * `--json` output: the requested fields, in gh's indentation-free form.
 *
 * @param {Json} item
 * @param {string[]} fields
 * @returns {string}
 */
export function pickJson(item, fields) {
  return `${JSON.stringify(Object.fromEntries(fields.map((field) => [field, item[field] ?? null])))}\n`;
}

/**
 * gh's non-terminal plain output for a view: tab-separated metadata, `--`,
 * the body. With `--comments`, gh prints the comments instead, each as its
 * own metadata block and body.
 *
 * @param {"issue" | "pr"} group
 * @param {Json} item
 * @param {boolean} comments
 * @returns {string}
 */
export function renderView(group, item, comments) {
  if (comments) {
    return arr(item.comments)
      .map((raw) => {
        const comment = rec(raw);
        return [
          `author:\t${str(rec(comment.author).login)}`,
          `association:\t${str(comment.authorAssociation).toLowerCase()}`,
          "edited:\tfalse",
          "status:\tnone",
          "--",
          str(comment.body),
          "--",
        ].join("\n");
      })
      .join("\n")
      .concat("\n");
  }
  const names = (/** @type {unknown} */ list) =>
    arr(list)
      .map((entry) => str(rec(entry).name) || str(rec(entry).login))
      .join(", ");
  const lines = [
    `title:\t${str(item.title)}`,
    `state:\t${str(item.state)}`,
    `author:\t${str(rec(item.author).login)}`,
    `labels:\t${names(item.labels)}`,
    `assignees:\t${names(item.assignees)}`,
    `number:\t${String(item.number)}`,
    `url:\t${str(item.url)}`,
  ];
  if (group === "pr") {
    lines.push(
      `head:\t${str(item.headRefName)}`,
      `base:\t${str(item.baseRefName)}`,
      `draft:\t${String(item.isDraft === true)}`,
    );
  }
  return `${lines.join("\n")}\n--\n${str(item.body)}\n`;
}
