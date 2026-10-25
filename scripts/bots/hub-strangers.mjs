/**
 * Comments by people with no role in the project never reach an agent.
 *
 * The repository is public. hub-visibility.mjs keeps a stranger's issue or
 * pull request away from the agents until the operator puts it on the
 * board, but a stranger can still comment on one of the company's own
 * issues, and that comment used to reach all nine agents word for word: a
 * prompt-injection channel straight into the company. The operator's rule
 * (#394) is that hubd replaces such a comment with a fixed placeholder, in
 * code, before any agent sees it.
 *
 * Who counts as the project is GitHub's `authorAssociation`, which is on
 * every comment in every REST and GraphQL answer: no extra lookup, and
 * nothing to go wrong when the collaborator list cannot be read. Only
 * `OWNER`, `MEMBER` and `COLLABORATOR` are kept. Everything else is
 * replaced, including a missing value and any value GitHub adds later, so
 * the rule fails closed.
 *
 * The author, association, date and URL stay, so an agent can tell the
 * operator that a hidden comment exists and where. Issue and pull request
 * titles and bodies are not touched: an outsider's item is visible only
 * once the operator has triaged it, and our own items are ours.
 *
 * Pure, like hub-visibility.mjs: hubd fetches, these functions decide. hubd
 * applies them; `hub.mjs` runs in the jail and is never trusted with it.
 */

import { stripped } from "./hub-alerts.mjs";

/** @typedef {Record<string, unknown>} Json */

/** The associations whose comments agents may read. */
export const PROJECT_ASSOCIATIONS = new Set(["OWNER", "MEMBER", "COLLABORATOR"]);

/** The `--json` fields of `issue|pr view|list` that carry comment bodies. */
export const COMMENT_FIELDS = new Set(["comments", "reviews", "latestReviews"]);

/**
 * `--json` fields that are neither in `VIEW_FIELDS` nor comments, and
 * hold no comment text. Every other field is refused, so a field gh adds
 * later cannot carry a comment past the scrub. Adding one here is a
 * reviewed change.
 */
export const COMMENT_FREE_FIELDS = new Set([
  "author",
  "assignees",
  "reviewDecision",
  "statusCheckRollup",
  "mergeable",
  "headRefName",
  "baseRefName",
  "files",
  "isDraft",
  "milestone",
  "projectItems",
  "closingIssuesReferences",
]);

/**
 * @param {unknown} value
 * @returns {string}
 */
function str(value) {
  return typeof value === "string" ? value : "";
}

/**
 * Whether a comment by an author with this association may be shown.
 *
 * @param {unknown} association
 * @returns {boolean}
 */
export function fromProject(association) {
  return typeof association === "string" && PROJECT_ASSOCIATIONS.has(association.toUpperCase());
}

/**
 * The line that stands in for a hidden comment, the same everywhere.
 *
 * @param {unknown} login
 * @param {unknown} association
 * @returns {string}
 */
export function placeholder(login, association) {
  const who = stripped(str(login));
  const role = stripped(str(association)) || "NONE";
  return `[hidden by hub: comment by @${who} (${role}), who has no role in this project. Not shown to agents. The operator can read it on GitHub.]`;
}

/**
 * One gh- or REST-shaped comment or review, with its body replaced unless
 * its author is in the project.
 *
 * @param {Json} comment `{ author: { login }, authorAssociation, body, … }`
 * @returns {Json}
 */
export function scrubComment(comment) {
  if (fromProject(comment.authorAssociation)) {
    return comment;
  }
  const author = isObject(comment.author) ? comment.author : {};
  return { ...comment, body: placeholder(author.login, comment.authorAssociation) };
}

/**
 * @param {unknown} value
 * @returns {value is Json}
 */
function isObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * One object with every comment field scrubbed, or `null` if one of them
 * is not an array of objects.
 *
 * @param {Json} item
 * @returns {Json | null}
 */
function scrubItem(item) {
  /** @type {Json} */
  const scrubbed = { ...item };
  for (const field of COMMENT_FIELDS) {
    if (!(field in item)) {
      continue;
    }
    const comments = item[field];
    if (!Array.isArray(comments) || !comments.every(isObject)) {
      return null;
    }
    scrubbed[field] = comments.map(scrubComment);
  }
  return scrubbed;
}

/**
 * A parsed gh `--json` answer, a view's object or a list's rows, with
 * every comment field scrubbed. `null` if it is neither, or a comment
 * field has the wrong shape: hubd then refuses rather than pass it on.
 *
 * @param {unknown} value
 * @returns {Json | Json[] | null}
 */
export function scrubJson(value) {
  if (Array.isArray(value)) {
    /** @type {Json[]} */
    const rows = [];
    for (const row of value) {
      const scrubbed = isObject(row) ? scrubItem(row) : null;
      if (scrubbed === null) {
        return null;
      }
      rows.push(scrubbed);
    }
    return rows;
  }
  return isObject(value) ? scrubItem(value) : null;
}

/**
 * Every field named by `--json` in an argument list, or `null` if there
 * is no `--json`. All occurrences count, whichever one gh would use.
 *
 * @param {string[]} argv
 * @returns {string[] | null}
 */
export function jsonFields(argv) {
  /** @type {string[] | null} */
  let fields = null;
  for (let i = 0; i < argv.length; i += 1) {
    const word = argv[i] ?? "";
    const value =
      word === "--json" ? (argv[i + 1] ?? "") : word.startsWith("--json=") ? word.slice(7) : null;
    if (value !== null) {
      fields = [...(fields ?? []), ...value.split(",").filter((field) => field !== "")];
    }
  }
  return fields;
}

/**
 * The first `--json` field hubd may not hand to gh for an `issue` or `pr`
 * read, or `null` if every one is known to be safe or is scrubbed.
 *
 * @param {string[]} fields
 * @param {Set<string>} viewFields the command's `VIEW_FIELDS` (hub-rest.mjs)
 * @returns {string | null}
 */
export function unknownField(fields, viewFields) {
  return (
    fields.find(
      (field) =>
        !viewFields.has(field) && !COMMENT_FIELDS.has(field) && !COMMENT_FREE_FIELDS.has(field),
    ) ?? null
  );
}
