/**
 * The board as hubd keeps it: patched, not re-read.
 *
 * Every visibility check, every `board ls` and the dashboard read the board,
 * so hubd holds one copy of it. The first version of that copy lived for a
 * minute and was dropped whole on every board mutation hubd ran, and the
 * company mutates the board all day: over ten hours, ~650 item-edits,
 * item-adds and item-archives cost 185 full re-reads, one every three
 * minutes, each a page of GraphQL per hundred cards.
 *
 * But hubd ran every one of those mutations itself and knows what each did.
 * A move is an item id and a new column; an archive is an item id gone. So
 * those are applied to the copy in place, for nothing. What hubd cannot
 * apply exactly (an item-add, whose column GitHub's own workflows decide) is
 * re-read as that one item, for a point. What hubd did not do itself (the
 * operator dragging a card in GitHub, GitHub's workflow moving a closed
 * issue to Done) is caught two ways: an issue close or a merge hubd served
 * is followed by a re-read of just that issue, and a full sweep still runs
 * once `BOARD_TTL_MS` has passed.
 *
 * Every change bumps a revision, so `board changes --since <token>` can
 * answer with only what moved, and `board wait` can poll hubd instead of
 * GitHub.
 *
 * Pure functions only, so all of it is tested without a network.
 */

import { boardItem, parseBudget } from "./hub-spend.mjs";

/**
 * The shape of `board.json`. A file that does not match it, by this number
 * or otherwise, is discarded and the board read afresh: there is nothing to
 * be compatible with (ADR-0016).
 */
export const BOARD_FORMAT_VERSION = 1;

/**
 * How long a full sweep stands. Ten minutes, because what it is still for is
 * what no hint covers: the operator moving a card by hand, or GitHub adding
 * an item on its own. An agent idles in `tg wait --timeout 540` between
 * looks at the board, so a board up to ten minutes behind on those is
 * fresher than any agent's next look. Everything hubd does itself shows at
 * once, and an issue it closed shows within `HINT_DELAY_MS`.
 */
export const BOARD_TTL_MS = 600_000;

/**
 * How long after an issue close or a merge the issue is re-read. GitHub's
 * project workflows ("closed → Done") run after the close returns, not with
 * it, so asking at once would read the column before it moved.
 */
export const HINT_DELAY_MS = 20_000;

/** Removed cards remembered for `board changes`; older ones force a reset. */
const MAX_REMOVED = 200;

/**
 * One item, in the shape `gh project item-list --format json` gives it, as
 * `boardItem` in hub-spend.mjs builds it.
 *
 * @typedef {Record<string, unknown>} Item
 */

/**
 * @typedef {object} Card
 * @property {number} rev the revision that last changed it
 * @property {Item} item
 */

/**
 * @typedef {object} Removal
 * @property {string} id
 * @property {number | null} number
 * @property {number} rev
 */

/**
 * @typedef {object} BoardState
 * @property {number} format `BOARD_FORMAT_VERSION`
 * @property {string} epoch names this line of revisions; a token from
 *   another is answered with the whole board
 * @property {number} rev
 * @property {number} floor `removed` is complete only for revisions above it
 * @property {number} sweptAt when the last full sweep finished, epoch ms
 * @property {number} at when anything last changed, epoch ms
 * @property {boolean} stale whether the next read must sweep
 * @property {Card[]} cards
 * @property {Removal[]} removed
 */

/**
 * What hubd learned about the board.
 *
 * `item`: this item is now `item`, or is not on the board (`null`).
 * `issue`: the items of this issue on the board are exactly `items`.
 *
 * @typedef {{ kind: "item", id: string, item: Item | null }
 *   | { kind: "issue", number: number, repo: string, items: Item[] }} Fact
 */

/* -------------------------------------------------------------------------- */
/* Small readers                                                              */
/* -------------------------------------------------------------------------- */

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
 * The value of `--name X` or `--name=X`, or `null`.
 *
 * @param {readonly string[]} argv
 * @param {string} name
 * @returns {string | null}
 */
export function flagValue(argv, name) {
  for (let at = 0; at < argv.length; at += 1) {
    const word = argv[at] ?? "";
    if (word === name) {
      const value = argv[at + 1];
      return value === undefined || value.startsWith("-") ? null : value;
    }
    if (word.startsWith(`${name}=`)) {
      return word.slice(name.length + 1);
    }
  }
  return null;
}

/**
 * The issue or pull request number an item is for, if it is in `repo`.
 *
 * @param {Item} item
 * @param {string} repo
 * @returns {number | null}
 */
export function itemNumber(item, repo) {
  const content = obj(item.content);
  return typeof content.number === "number" &&
    typeof content.repository === "string" &&
    content.repository.toLowerCase() === repo.toLowerCase()
    ? content.number
    : null;
}

/**
 * An issue or pull request number out of a selector: a number, or a URL in
 * `repo`.
 *
 * @param {string | undefined} selector
 * @param {string} repo
 * @returns {number | null}
 */
export function selectorNumber(selector, repo) {
  if (selector === undefined) {
    return null;
  }
  if (/^\d+$/.test(selector)) {
    return Number(selector);
  }
  const match = /^https:\/\/github\.com\/([^/]+\/[^/]+)\/(?:issues|pull)\/(\d+)\/?$/.exec(selector);
  return match !== null && match[1]?.toLowerCase() === repo.toLowerCase() ? Number(match[2]) : null;
}

/* -------------------------------------------------------------------------- */
/* Changing the state                                                         */
/* -------------------------------------------------------------------------- */

/**
 * @param {readonly Removal[]} removed
 * @param {number} floor
 * @returns {{ removed: Removal[], floor: number }}
 */
function trim(removed, floor) {
  if (removed.length <= MAX_REMOVED) {
    return { removed: [...removed], floor };
  }
  const dropped = removed.slice(0, removed.length - MAX_REMOVED);
  return {
    removed: removed.slice(-MAX_REMOVED),
    floor: Math.max(floor, ...dropped.map((removal) => removal.rev)),
  };
}

/**
 * The state after a full read of the board: cards that changed get a new
 * revision, cards that are gone are remembered as removed. With no previous
 * state, a new line of revisions starts under `epoch`.
 *
 * @param {BoardState | null} previous
 * @param {readonly Item[]} items
 * @param {number} now
 * @param {string} epoch used only when `previous` is `null`
 * @param {string} repo
 * @returns {BoardState}
 */
export function sweep(previous, items, now, epoch, repo) {
  if (previous === null) {
    return {
      format: BOARD_FORMAT_VERSION,
      epoch,
      rev: 1,
      floor: 0,
      sweptAt: now,
      at: now,
      stale: false,
      cards: items.map((item) => ({ rev: 1, item })),
      removed: [],
    };
  }
  const rev = previous.rev + 1;
  const before = new Map(previous.cards.map((card) => [String(card.item.id), card]));
  const ids = new Set(items.map((item) => String(item.id)));
  const cards = items.map((item) => {
    const old = before.get(String(item.id));
    return old !== undefined && JSON.stringify(old.item) === JSON.stringify(item)
      ? old
      : { rev, item };
  });
  const gone = previous.cards
    .filter((card) => !ids.has(String(card.item.id)))
    .map((card) => ({ id: String(card.item.id), number: itemNumber(card.item, repo), rev }));
  const changed = gone.length > 0 || cards.some((card) => card.rev === rev);
  const kept = previous.removed.filter((removal) => !ids.has(removal.id));
  const { removed, floor } = trim([...kept, ...gone], previous.floor);
  return {
    ...previous,
    rev: changed ? rev : previous.rev,
    floor,
    sweptAt: now,
    at: changed ? now : previous.at,
    stale: false,
    cards,
    removed,
  };
}

/**
 * The state with `facts` applied. Anything that actually changed shares one
 * new revision; facts that change nothing leave the state as it was.
 *
 * @param {BoardState} state
 * @param {readonly Fact[]} facts
 * @param {number} now
 * @param {string} repo
 * @returns {BoardState}
 */
export function applyFacts(state, facts, now, repo) {
  const rev = state.rev + 1;
  const draft = { cards: [...state.cards], removed: [...state.removed], changed: false };

  /** @param {string} id */
  const drop = (id) => {
    const card = draft.cards.find((candidate) => candidate.item.id === id);
    if (card !== undefined) {
      draft.cards = draft.cards.filter((candidate) => candidate !== card);
      draft.removed = [
        ...draft.removed.filter((removal) => removal.id !== id),
        { id, number: itemNumber(card.item, repo), rev },
      ];
      draft.changed = true;
    }
  };
  /** @param {Item} item */
  const put = (item) => {
    const at = draft.cards.findIndex((candidate) => candidate.item.id === item.id);
    if (at !== -1 && JSON.stringify(draft.cards[at]?.item) === JSON.stringify(item)) {
      return;
    }
    draft.cards =
      at === -1
        ? [...draft.cards, { rev, item }]
        : draft.cards.map((card, index) => (index === at ? { rev, item } : card));
    draft.removed = draft.removed.filter((removal) => removal.id !== item.id);
    draft.changed = true;
  };

  for (const fact of facts) {
    if (fact.kind === "item") {
      if (fact.item === null) {
        drop(fact.id);
      } else {
        put(fact.item);
      }
      continue;
    }
    const wanted = new Set(fact.items.map((item) => item.id));
    for (const card of draft.cards) {
      if (itemNumber(card.item, fact.repo) === fact.number && !wanted.has(card.item.id)) {
        drop(String(card.item.id));
      }
    }
    for (const item of fact.items) {
      put(item);
    }
  }

  if (!draft.changed) {
    return state;
  }
  return { ...state, rev, at: now, cards: draft.cards, ...trim(draft.removed, state.floor) };
}

/**
 * Whether the next read must go to GitHub for the whole board.
 *
 * @param {BoardState | null} state
 * @param {number} now
 * @returns {boolean}
 */
export function needsSweep(state, now) {
  return state === null || state.stale || now - state.sweptAt >= BOARD_TTL_MS;
}

/**
 * The board as `gh project item-list --format json` lists it.
 *
 * @param {BoardState} state
 * @returns {{ items: Item[], totalCount: number }}
 */
export function listing(state) {
  return { items: state.cards.map((card) => card.item), totalCount: state.cards.length };
}

/* -------------------------------------------------------------------------- */
/* What a mutation hubd ran did to the board                                  */
/* -------------------------------------------------------------------------- */

/**
 * The board's ids, from `company.json`.
 *
 * @typedef {object} BoardIds
 * @property {number} project the project number
 * @property {string} projectId
 * @property {string} fieldId the Status field
 * @property {Map<string, string>} options Status option name → option id
 */

/**
 * What to do to the copy after hubd ran a `gh project ...` command.
 *
 * `apply`: these facts are exact; apply them for free.
 * `item` / `issue`: re-read that one item, or that issue's items.
 * `none`: the board's cards did not change.
 * `sweep`: hubd cannot tell; read the whole board next time.
 *
 * @typedef {{ kind: "apply", facts: Fact[] }
 *   | { kind: "item", id: string }
 *   | { kind: "issue", number: number }
 *   | { kind: "none" }
 *   | { kind: "sweep" }} Plan
 */

/** Project commands that only read. */
const PROJECT_READS = new Set(["item-list", "field-list", "list", "view"]);

/**
 * @param {readonly string[]} argv
 * @param {{ code: number, stdout: string }} result
 * @param {BoardIds} ids
 * @param {BoardState | null} state
 * @param {string} repo
 * @returns {Plan}
 */
export function planMutation(argv, result, ids, state, repo) {
  const [group, sub = "", positional] = argv;
  if (group !== "project" || PROJECT_READS.has(sub)) {
    return { kind: "none" };
  }
  // A failed gh call is GitHub refusing the mutation, so nothing moved. The
  // rare one that timed out after GitHub applied it is caught by the sweep.
  if (result.code !== 0) {
    return { kind: "none" };
  }
  // Another project's board is not this copy.
  if (
    positional !== undefined &&
    !positional.startsWith("-") &&
    positional !== String(ids.project)
  ) {
    return { kind: "none" };
  }
  const projectId = flagValue(argv, "--project-id");
  if (projectId !== null && projectId !== ids.projectId) {
    return { kind: "none" };
  }
  const id = flagValue(argv, "--id");
  const card = state?.cards.find((candidate) => candidate.item.id === id);
  const returned = returnedId(result.stdout);

  switch (sub) {
    case "item-edit": {
      // `--id` is a draft issue's id, not an item's, when a draft's title or
      // body is edited, so re-reading it as an item would lose the card.
      if (id === null || argv.some((word) => /^--(title|body)(=|$)/.test(word))) {
        return { kind: "sweep" };
      }
      const field = flagValue(argv, "--field-id");
      if (field !== ids.fieldId) {
        // Only Status is kept, and this was another field.
        return field === null ? { kind: "sweep" } : { kind: "none" };
      }
      const optionId = flagValue(argv, "--single-select-option-id");
      const name = [...ids.options].find(([, option]) => option === optionId)?.[0];
      if (card !== undefined && name !== undefined) {
        return {
          kind: "apply",
          facts: [{ kind: "item", id, item: { ...card.item, status: name } }],
        };
      }
      if (card !== undefined && argv.includes("--clear")) {
        const { status: _cleared, ...rest } = card.item;
        return { kind: "apply", facts: [{ kind: "item", id, item: rest }] };
      }
      return { kind: "item", id };
    }
    case "item-archive":
      if (id === null) {
        return { kind: "sweep" };
      }
      return argv.includes("--undo")
        ? { kind: "item", id }
        : { kind: "apply", facts: [{ kind: "item", id, item: null }] };
    case "item-delete":
      return id === null
        ? { kind: "sweep" }
        : { kind: "apply", facts: [{ kind: "item", id, item: null }] };
    case "item-add": {
      // The new card's column is GitHub's to decide, by the project's
      // workflows, so it is read back rather than guessed.
      if (returned !== null) {
        return { kind: "item", id: returned };
      }
      const number = selectorNumber(flagValue(argv, "--url") ?? undefined, repo);
      return number === null ? { kind: "sweep" } : { kind: "issue", number };
    }
    case "item-create":
      return returned === null ? { kind: "sweep" } : { kind: "item", id: returned };
    default:
      // Fields, links, the project itself: rare, and not worth reasoning
      // about one by one.
      return { kind: "sweep" };
  }
}

/**
 * The item id out of `--format json` output, if that is what gh printed.
 *
 * @param {string} stdout
 * @returns {string | null}
 */
function returnedId(stdout) {
  try {
    const id = obj(/** @type {unknown} */ (JSON.parse(stdout))).id;
    return typeof id === "string" && id.startsWith("PVTI_") ? id : null;
  } catch {
    return null;
  }
}

/**
 * Which issue to re-read, later, after hubd served something GitHub's
 * project workflows react to, or that renames a card: an issue or pull
 * request closed, reopened, merged or retitled.
 *
 * @param {readonly string[]} argv
 * @param {number} code
 * @param {string} repo
 * @returns {number | null}
 */
export function planHint(argv, code, repo) {
  const [group, verb = ""] = argv;
  if (code !== 0 || (group !== "issue" && group !== "pr")) {
    return null;
  }
  const retitled = verb === "edit" && argv.some((word) => /^(--title|-t)(=|$)/.test(word));
  const lifecycle = ["close", "reopen"].includes(verb) || (group === "pr" && verb === "merge");
  return retitled || lifecycle ? selectorNumber(argv[2], repo) : null;
}

/* -------------------------------------------------------------------------- */
/* Re-reading one item                                                        */
/* -------------------------------------------------------------------------- */

const ITEM_FIELDS = `
  id
  isArchived
  project { id }
  status: fieldValueByName(name: "Status") {
    ... on ProjectV2ItemFieldSingleSelectValue { name }
  }
  content {
    __typename
    ... on Issue { number title url repository { nameWithOwner } }
    ... on PullRequest { number title url repository { nameWithOwner } }
    ... on DraftIssue { title }
  }`;

/** One project item, by its id. */
export const ITEM_QUERY = `query($item: ID!) {
  rateLimit { cost remaining resetAt }
  item: node(id: $item) { ... on ProjectV2Item {${ITEM_FIELDS} } }
}`;

/**
 * Every project item of one issue or pull request, and for a pull request
 * those of the issues it closes, which a merge moves too.
 */
export const ISSUE_ITEMS_QUERY = `query($owner: String!, $name: String!, $number: Int!) {
  rateLimit { cost remaining resetAt }
  repository(owner: $owner, name: $name) {
    issueOrPullRequest(number: $number) {
      ... on Issue { number projectItems(first: 20) { nodes {${ITEM_FIELDS} } } }
      ... on PullRequest {
        number
        projectItems(first: 20) { nodes {${ITEM_FIELDS} } }
        closingIssuesReferences(first: 10) {
          nodes { number projectItems(first: 20) { nodes {${ITEM_FIELDS} } } }
        }
      }
    }
  }
}`;

/**
 * @typedef {object} Reread
 * @property {Fact[]} facts
 * @property {number | null} cost
 * @property {import("./hub-spend.mjs").Budget | null} budget
 */

/**
 * @param {string} json
 * @returns {{ data: Record<string, unknown>, cost: number | null, budget: import("./hub-spend.mjs").Budget | null } | null}
 */
function answer(json) {
  /** @type {unknown} */
  let parsed;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }
  const root = obj(parsed);
  if (Array.isArray(root.errors) && root.errors.length > 0) {
    return null;
  }
  const data = obj(root.data);
  return { data, ...parseBudget(data.rateLimit) };
}

/**
 * An item node as it is on this board: `null` when archived or on another
 * project.
 *
 * @param {Record<string, unknown>} node
 * @param {string} projectId
 * @returns {Item | null}
 */
function onBoard(node, projectId) {
  return node.isArchived === true || obj(node.project).id !== projectId ? null : boardItem(node);
}

/**
 * ITEM_QUERY's answer as one fact, or `null` if it is not an answer.
 *
 * @param {string} json
 * @param {string} id the item asked about
 * @param {string} projectId
 * @returns {Reread | null}
 */
export function parseItemAnswer(json, id, projectId) {
  const parsed = answer(json);
  if (parsed === null || !("item" in parsed.data)) {
    return null;
  }
  const node = obj(parsed.data.item);
  // `null`, or not an item at all: whatever this id was, it is no card.
  const item = node.id === id ? onBoard(node, projectId) : null;
  return { facts: [{ kind: "item", id, item }], cost: parsed.cost, budget: parsed.budget };
}

/**
 * ISSUE_ITEMS_QUERY's answer as facts, one per issue it names, or `null` if
 * it is not an answer.
 *
 * @param {string} json
 * @param {number} number the issue or pull request asked about
 * @param {string} projectId
 * @param {string} repo
 * @returns {Reread | null}
 */
export function parseIssueAnswer(json, number, projectId, repo) {
  const parsed = answer(json);
  if (parsed === null || !("repository" in parsed.data)) {
    return null;
  }
  const subject = obj(obj(parsed.data.repository).issueOrPullRequest);
  /** @type {Fact[]} */
  const facts = [];
  /**
   * @param {number} issue
   * @param {unknown} connection
   */
  const add = (issue, connection) => {
    /** @type {unknown} */
    const nodes = obj(connection).nodes;
    const items = (Array.isArray(nodes) ? /** @type {unknown[]} */ (nodes) : [])
      .map((node) => onBoard(obj(node), projectId))
      .filter((item) => item !== null);
    facts.push({ kind: "issue", number: issue, repo, items });
  };
  // No such issue, or not one this token may see: none of its cards stand.
  add(number, subject.projectItems);
  /** @type {unknown} */
  const closing = obj(subject.closingIssuesReferences).nodes;
  for (const raw of Array.isArray(closing) ? /** @type {unknown[]} */ (closing) : []) {
    const issue = obj(raw);
    if (typeof issue.number === "number") {
      add(issue.number, issue.projectItems);
    }
  }
  return { facts, cost: parsed.cost, budget: parsed.budget };
}

/* -------------------------------------------------------------------------- */
/* Answering `board`                                                          */
/* -------------------------------------------------------------------------- */

/**
 * What `board` prints a card from.
 *
 * @typedef {object} Summary
 * @property {string} id
 * @property {number | null} number
 * @property {string} title
 * @property {string} status `""` when it is in no column
 * @property {string} type Issue, PullRequest or DraftIssue
 */

/**
 * @param {Item} item
 * @param {string} repo
 * @returns {Summary}
 */
function summary(item, repo) {
  const content = obj(item.content);
  return {
    id: String(item.id),
    number: itemNumber(item, repo),
    title: typeof content.title === "string" ? content.title : "",
    status: typeof item.status === "string" ? item.status : "",
    type: typeof content.type === "string" ? content.type : "",
  };
}

/**
 * @param {BoardState} state
 * @returns {string}
 */
export function tokenOf(state) {
  return `${state.epoch}.${String(state.rev)}`;
}

/**
 * The request `board` sends, checked: `ls [column]`, `show <issue>
 * [--fresh]`, or `changes [--since <token>]`.
 *
 * @typedef {{ verb: "ls", column: string }
 *   | { verb: "show", number: number, fresh: boolean }
 *   | { verb: "changes", since: string | null }} BoardRequest
 */

/**
 * @param {readonly string[]} argv
 * @returns {BoardRequest | { error: string }}
 */
export function parseBoardRequest(argv) {
  const [verb, ...rest] = argv;
  if (verb === "ls") {
    return { verb, column: rest.join(" ").trim() };
  }
  if (verb === "show") {
    const fresh = rest.includes("--fresh");
    const words = rest.filter((word) => word !== "--fresh");
    const number = Number(words[0]);
    return words.length === 1 && Number.isInteger(number) && number > 0
      ? { verb, number, fresh }
      : { error: "usage: board show <issue> [--fresh]" };
  }
  if (verb === "changes") {
    if (rest.length === 0) {
      return { verb, since: null };
    }
    const since = flagValue(rest, "--since");
    return since !== null && rest.length <= 2
      ? { verb, since }
      : { error: "usage: board changes [--since <token>]" };
  }
  return {
    error: "usage: board <ls [column] | show <issue> [--fresh] | changes [--since <token>]>",
  };
}

/**
 * The answer to a `board` request, as JSON.
 *
 * @param {BoardState} state
 * @param {BoardRequest} request
 * @param {string} repo
 * @returns {Record<string, unknown>}
 */
export function answerBoard(state, request, repo) {
  const token = tokenOf(state);
  const all = state.cards.map((card) => summary(card.item, repo));
  if (request.verb === "ls") {
    const cards =
      request.column === "" ? all : all.filter((card) => card.status === request.column);
    return { token, sweptAt: state.sweptAt, cards };
  }
  if (request.verb === "show") {
    return {
      token,
      sweptAt: state.sweptAt,
      card: all.find((card) => card.number === request.number) ?? null,
    };
  }
  const since = parseToken(request.since);
  if (since?.epoch !== state.epoch || since.rev < state.floor || since.rev > state.rev) {
    return { token, reset: true, cards: all, removed: [] };
  }
  return {
    token,
    reset: false,
    cards: state.cards
      .filter((card) => card.rev > since.rev)
      .map((card) => summary(card.item, repo)),
    removed: state.removed
      .filter((removal) => removal.rev > since.rev)
      .map(({ id, number }) => ({ id, number })),
  };
}

/* -------------------------------------------------------------------------- */
/* Ranking (#351)                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Moves an item within the project's manual order, the order the board's
 * GitHub view shows and BOARD_QUERY reads (`items` is ordered by position).
 * No `$after` puts it on top.
 */
export const RANK_MUTATION = `mutation($project: ID!, $item: ID!, $after: ID) {
  updateProjectV2ItemPosition(input: { projectId: $project, itemId: $item, afterId: $after }) {
    clientMutationId
  }
}`;

/**
 * The request `board rank` sends, checked: `<issue> top`, `<issue> bottom`
 * or `<issue> after <other>`.
 *
 * @typedef {{ number: number, place: "top" | "bottom" }
 *   | { number: number, place: "after", after: number }} RankRequest
 */

const RANK_USAGE = "usage: board rank <issue> top | bottom | after <other-issue>";

/**
 * @param {string | undefined} word
 * @returns {number | null}
 */
function issueNumber(word) {
  return word !== undefined && /^\d+$/.test(word) && Number(word) > 0 ? Number(word) : null;
}

/**
 * @param {readonly string[]} argv
 * @returns {RankRequest | { error: string }}
 */
export function parseRankRequest(argv) {
  const [first, place, other, ...rest] = argv;
  const number = issueNumber(first);
  if (number === null || rest.length > 0) {
    return { error: RANK_USAGE };
  }
  if ((place === "top" || place === "bottom") && other === undefined) {
    return { number, place };
  }
  const after = issueNumber(other);
  if (place !== "after" || after === null) {
    return { error: RANK_USAGE };
  }
  if (after === number) {
    return { error: `#${String(number)} cannot go after itself` };
  }
  return { number, place, after };
}

/**
 * The item to rank and the item it is to follow, `null` for the top.
 * Positions are the whole project's, not a column's, so `bottom` is after
 * the last card on the board.
 *
 * @param {BoardState} state
 * @param {RankRequest} request
 * @param {string} repo
 * @returns {{ id: string, afterId: string | null } | { error: string }}
 */
export function rankTarget(state, request, repo) {
  /** @param {number} number */
  const find = (number) => state.cards.find((card) => itemNumber(card.item, repo) === number);
  const card = find(request.number);
  if (card === undefined) {
    return { error: `#${String(request.number)} is not on the board` };
  }
  const id = String(card.item.id);
  if (request.place === "after") {
    const after = find(request.after);
    return after === undefined
      ? { error: `#${String(request.after)} is not on the board` }
      : { id, afterId: String(after.item.id) };
  }
  if (request.place === "top") {
    return { id, afterId: null };
  }
  const last = state.cards.filter((other) => other !== card).at(-1);
  return { id, afterId: last === undefined ? null : String(last.item.id) };
}

/**
 * The state with card `id` just after `afterId`, or first for `null`, as
 * GitHub now orders them. A rank to where the card already is, or of a card
 * or after one the copy does not hold, leaves the state as it was.
 *
 * @param {BoardState} state
 * @param {string} id
 * @param {string | null} afterId
 * @param {number} now
 * @returns {BoardState}
 */
export function rankCards(state, id, afterId, now) {
  const from = state.cards.findIndex((card) => card.item.id === id);
  const card = state.cards[from];
  if (card === undefined) {
    return state;
  }
  const others = state.cards.filter((other) => other !== card);
  const at = afterId === null ? 0 : others.findIndex((other) => other.item.id === afterId) + 1;
  if (at === 0 && afterId !== null) {
    return state;
  }
  if (at === from) {
    return state;
  }
  const rev = state.rev + 1;
  return {
    ...state,
    rev,
    at: now,
    cards: [...others.slice(0, at), { rev, item: card.item }, ...others.slice(at)],
  };
}

/**
 * @param {number} n
 * @returns {string}
 */
function ordinal(n) {
  const teen = n % 100 >= 11 && n % 100 <= 13;
  const suffix = teen ? "th" : (["th", "st", "nd", "rd"][n % 10] ?? "th");
  return `${String(n)}${suffix}`;
}

/**
 * What `board rank` prints: `#12: now 1st of 14 in Backlog`.
 *
 * @param {BoardState} state
 * @param {string} id
 * @param {string} repo
 * @returns {string}
 */
export function rankLine(state, id, repo) {
  const card = state.cards.find((candidate) => candidate.item.id === id);
  if (card === undefined) {
    return `${id}: ranked`;
  }
  const { number, status } = summary(card.item, repo);
  const column = state.cards.filter((other) => summary(other.item, repo).status === status);
  const place = column.indexOf(card) + 1;
  return `#${String(number ?? "-")}: now ${ordinal(place)} of ${String(column.length)} in ${status || "(no column)"}`;
}

/**
 * What `board wait <column>` learns from one `board changes` answer: the
 * cards that arrived in the column since it last looked, and the column's
 * cards as it now knows them. A card that leaves and comes back arrives
 * again.
 *
 * @param {ReadonlySet<string>} known ids of the cards already in the column
 * @param {Record<string, unknown>} changes `answerBoard`'s answer to `changes`
 * @param {string} column
 * @returns {{ arrived: Summary[], known: Set<string> }}
 */
export function arrivals(known, changes, column) {
  /** @type {unknown} */
  const rawCards = changes.cards;
  /** @type {unknown} */
  const rawRemoved = changes.removed;
  const cards = Array.isArray(rawCards) ? /** @type {Summary[]} */ (rawCards) : [];
  const removed = Array.isArray(rawRemoved) ? /** @type {{ id: string }[]} */ (rawRemoved) : [];
  const next = new Set(changes.reset === true ? [] : known);
  /** @type {Summary[]} */
  const arrived = [];
  for (const card of cards) {
    if (card.status !== column) {
      next.delete(card.id);
      continue;
    }
    if (!known.has(card.id)) {
      arrived.push(card);
    }
    next.add(card.id);
  }
  for (const { id } of removed) {
    next.delete(id);
  }
  return { arrived, known: next };
}

/** The board's columns, in workflow order. */
export const COLUMNS = ["Backlog", "Ready", "In Progress", "In Review", "QA", "Done"];

/** Done cards a bare `board ls` shows; the rest are a `board ls Done` away. */
export const DONE_SHOWN = 5;

/**
 * What `board ls` prints: the cards grouped by column in workflow order, so
 * the output reads like the board rather than like a database dump.
 *
 * Folded, as for a bare `board ls`, Done keeps only its last `DONE_SHOWN`
 * cards in the order hubd's copy gives, the most recent last, and says how
 * many it left out. Done is most of the board, and every fresh agent turn
 * reads the whole listing (#324).
 *
 * @param {readonly Summary[]} cards
 * @param {boolean} fold
 * @returns {string[]}
 */
export function boardLines(cards, fold) {
  /** @param {Summary} card */
  const line = (card) => `  #${String(card.number ?? "-").padEnd(4)} ${card.title}`;
  /** @type {string[]} */
  const lines = [];
  for (const column of COLUMNS) {
    const group = cards.filter((card) => card.status === column);
    if (group.length === 0) {
      continue;
    }
    const hidden = fold && column === "Done" ? Math.max(0, group.length - DONE_SHOWN) : 0;
    lines.push(`${column}:`, ...group.slice(hidden).map(line));
    if (hidden > 0) {
      lines.push(`  … ${String(hidden)} more: board ls Done`);
    }
  }
  const loose = cards.filter((card) => !COLUMNS.includes(card.status));
  if (loose.length > 0) {
    lines.push("(no column):", ...loose.map(line));
  }
  return lines;
}

/**
 * @param {string | null} token
 * @returns {{ epoch: string, rev: number } | null}
 */
function parseToken(token) {
  const match = token === null ? null : /^([A-Za-z0-9-]+)\.(\d+)$/.exec(token);
  return match === null ? null : { epoch: match[1] ?? "", rev: Number(match[2]) };
}

/* -------------------------------------------------------------------------- */
/* board.json                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * `board.json` as hubd wrote it, or `null` if it is not in the current
 * shape. Never adapted: a stale file is discarded and the board read again.
 *
 * @param {unknown} value
 * @returns {BoardState | null}
 */
export function readBoardState(value) {
  const raw = obj(value);
  const { rev, floor, sweptAt, at, epoch, stale } = raw;
  /** @type {unknown} */
  const rawCards = raw.cards;
  /** @type {unknown} */
  const rawRemoved = raw.removed;
  if (
    raw.format !== BOARD_FORMAT_VERSION ||
    typeof epoch !== "string" ||
    !/^[A-Za-z0-9-]+$/.test(epoch) ||
    typeof rev !== "number" ||
    typeof floor !== "number" ||
    typeof sweptAt !== "number" ||
    typeof at !== "number" ||
    typeof stale !== "boolean" ||
    !Array.isArray(rawCards) ||
    !Array.isArray(rawRemoved)
  ) {
    return null;
  }
  /** @type {Card[]} */
  const cards = [];
  for (const entry of /** @type {unknown[]} */ (rawCards)) {
    const card = obj(entry);
    const item = obj(card.item);
    if (
      typeof card.rev !== "number" ||
      typeof item.id !== "string" ||
      typeof item.content !== "object" ||
      item.content === null
    ) {
      return null;
    }
    cards.push({ rev: card.rev, item });
  }
  /** @type {Removal[]} */
  const removed = [];
  for (const entry of /** @type {unknown[]} */ (rawRemoved)) {
    const removal = obj(entry);
    if (
      typeof removal.id !== "string" ||
      typeof removal.rev !== "number" ||
      !(typeof removal.number === "number" || removal.number === null)
    ) {
      return null;
    }
    removed.push({ id: removal.id, number: removal.number, rev: removal.rev });
  }
  return { format: BOARD_FORMAT_VERSION, epoch, rev, floor, sweptAt, at, stale, cards, removed };
}
