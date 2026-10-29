/**
 * `hub wiki` (#1380): a GW1 wiki page as text, even while wiki.guildwars.com
 * is down, its Wayback snapshots, and a diff of two of them. With it, agents
 * research mechanics instead of asking the operator.
 *
 * hubd runs this on the host, with the real `fetch`; the tests inject one.
 * Everything here is the page logic: the words, the URLs, telling the
 * maintenance page from a page, picking a snapshot, the text and the diff.
 *
 * The wiki's maintenance page answers HTTP 200, so a status check alone
 * would take it for the page: it is told apart by its title. Wayback has
 * archived it too, so a snapshot is checked the same way.
 *
 * There is no cache yet (#1380 is 1/2): each request asks again.
 */

export const LIVE_ORIGIN = "https://wiki.guildwars.com";
export const ARCHIVE_ORIGIN = "https://web.archive.org";
export const USER_AGENT = "VibeWars-research (+https://github.com/Enteee/VibeWars)";
/** Per read, its redirects included. A wiki request makes a few, one at a time. */
export const FETCH_TIMEOUT_MS = 15_000;
/** A read whose body is longer is refused: a wiki page is a few hundred KiB. */
export const MAX_PAGE_BYTES = 4 * 1024 * 1024;
/** Redirects one read follows, each only to one of the two origins. */
const MAX_REDIRECTS = 3;
/**
 * The most line pairs a diff compares. Its table is that many cells, built on
 * hubd's only thread, and the wiki is editable by anyone.
 */
export const MAX_DIFF_CELLS = 4_000_000;

/** The most snapshots one request reads before giving up on finding a page. */
const MAX_SNAPSHOT_TRIES = 3;

/** Lines of context around each change in a diff, as `diff -u`. */
const CONTEXT_LINES = 3;

const MAINTENANCE_TITLE = "The Guild Wars Wikis are undergoing maintenance.";

const USAGE =
  "usage: hub wiki get <Page> [--at YYYY-MM-DD] | hub wiki history <Page> | " +
  "hub wiki diff <Page> <YYYY-MM-DD> [<YYYY-MM-DD> | live]";

/**
 * @typedef {{ verb: "get", page: string, at: string | null }
 *   | { verb: "history", page: string }
 *   | { verb: "diff", page: string, from: string, to: string }} WikiRequest
 *   `to` is a date or `"live"`
 */

/**
 * @typedef {object} WikiDeps
 * @property {(url: string, init: {
 *   headers: Record<string, string>, redirect: "manual", signal: AbortSignal,
 * }) => Promise<Response>} fetch
 * @property {{ live: string, archive: string }} [origins] the real hosts by default
 * @property {number} [timeoutMs] per HTTP request
 */

/**
 * The words after `hub wiki`. Anything else is refused with the usage.
 *
 * @param {string[]} argv
 * @returns {WikiRequest | { error: string }}
 */
export function parseWikiRequest(argv) {
  const [verb, page, ...rest] = argv;
  if (page === undefined || page.trim() === "" || hasDotSegment(page)) {
    return { error: USAGE };
  }
  if (verb === "get") {
    if (rest.length === 0) {
      return { verb, page, at: null };
    }
    if (rest.length === 2 && rest[0] === "--at" && isDate(rest[1] ?? "")) {
      return { verb, page, at: rest[1] ?? null };
    }
    return { error: USAGE };
  }
  if (verb === "history" && rest.length === 0) {
    return { verb, page };
  }
  if (verb === "diff" && (rest.length === 1 || rest.length === 2)) {
    const [from = "", to = "live"] = rest;
    if (isDate(from) && (to === "live" || isDate(to))) {
      return { verb, page, from, to };
    }
  }
  return { error: USAGE };
}

/**
 * A `.` or `..` path segment, which `fetch` would resolve out of `/wiki/`.
 *
 * @param {string} page
 * @returns {boolean}
 */
function hasDotSegment(page) {
  return pageSlug(page)
    .split("/")
    .some((segment) => segment === "." || segment === "..");
}

/**
 * A real calendar date, written YYYY-MM-DD.
 *
 * @param {string} text
 * @returns {boolean}
 */
function isDate(text) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return false;
  }
  const date = new Date(`${text}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === text;
}

/**
 * The page's name as the wiki's URLs have it: as typed, spaces as `_`.
 *
 * @param {string} page
 * @returns {string}
 */
export function pageSlug(page) {
  return page.trim().replaceAll(" ", "_");
}

/**
 * @param {string} page
 * @returns {string}
 */
function pagePath(page) {
  return `/wiki/${pageSlug(page).split("/").map(encodeURIComponent).join("/")}`;
}

/**
 * @param {string} page
 * @param {{ live: string }} origins
 * @returns {string}
 */
export function liveUrl(page, origins) {
  return `${origins.live}${pagePath(page)}`;
}

/**
 * Every snapshot whose content differs from the one before, oldest first.
 *
 * @param {string} page
 * @param {{ archive: string }} origins
 * @returns {string}
 */
export function cdxUrl(page, origins) {
  const url = encodeURIComponent(`wiki.guildwars.com${pagePath(page)}`);
  return (
    `${origins.archive}/cdx/search/cdx?url=${url}&output=json` +
    "&fl=timestamp,statuscode,digest&filter=statuscode:200&collapse=digest"
  );
}

/**
 * The snapshot as archived, without the Wayback toolbar (`id_`).
 *
 * @param {string} page
 * @param {string} timestamp YYYYMMDDhhmmss
 * @param {{ archive: string }} origins
 * @returns {string}
 */
export function snapshotUrl(page, timestamp, origins) {
  return `${origins.archive}/web/${timestamp}id_/${LIVE_ORIGIN}${pagePath(page)}`;
}

/**
 * @param {string} html
 * @returns {boolean}
 */
export function isMaintenance(html) {
  const title = /<title>([^<]*)<\/title>/i.exec(html)?.[1] ?? "";
  return decodeEntities(title).trim() === MAINTENANCE_TITLE;
}

/**
 * @typedef {{ timestamp: string, digest: string }} Snapshot
 */

/**
 * The CDX answer, oldest first, one entry per run of the same content.
 * Wayback collapses adjacent digests itself; this holds even if it did not.
 *
 * @param {string} text
 * @returns {Snapshot[] | null} `null` when it is not a CDX answer
 */
export function parseCdx(text) {
  /** @type {unknown} */
  let parsed;
  try {
    parsed = JSON.parse(text === "" ? "[]" : text);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed)) {
    return null;
  }
  /** @type {Snapshot[]} */
  const snapshots = [];
  for (const row of parsed.slice(1)) {
    if (!Array.isArray(row)) {
      return null;
    }
    const [timestamp, status, digest] = row.map(String);
    if (timestamp === undefined || !/^\d{14}$/.test(timestamp) || digest === undefined) {
      return null;
    }
    if (status === "200" && snapshots.at(-1)?.digest !== digest) {
      snapshots.push({ timestamp, digest });
    }
  }
  return snapshots;
}

/**
 * @param {string} timestamp YYYYMMDDhhmmss
 * @returns {string} YYYY-MM-DD
 */
export function snapshotDate(timestamp) {
  return `${timestamp.slice(0, 4)}-${timestamp.slice(4, 6)}-${timestamp.slice(6, 8)}`;
}

/**
 * The snapshots worth trying, newest first: all, or those on or before `at`.
 *
 * @param {Snapshot[]} snapshots oldest first
 * @param {string | null} at YYYY-MM-DD
 * @returns {Snapshot[]}
 */
export function pickSnapshots(snapshots, at) {
  const until = at === null ? null : `${at.replaceAll("-", "")}235959`;
  return snapshots.filter((s) => until === null || s.timestamp <= until).reverse();
}

/* -------------------------------------------------------------------------- */
/* Text                                                                       */
/* -------------------------------------------------------------------------- */

/** @type {Record<string, string>} */
const NAMED_ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

/**
 * @param {string} text
 * @returns {string}
 */
function decodeEntities(text) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, /** @type {string} */ name) => {
    if (name.startsWith("#x") || name.startsWith("#X")) {
      return String.fromCodePoint(Number.parseInt(name.slice(2), 16));
    }
    if (name.startsWith("#")) {
      return String.fromCodePoint(Number.parseInt(name.slice(1), 10));
    }
    return NAMED_ENTITIES[name.toLowerCase()] ?? whole;
  });
}

/**
 * Where the element opened at `start` ends, counting nested elements of the
 * same tag: MediaWiki nests spans in spans and divs in divs.
 *
 * @param {string} html
 * @param {number} start the index of the opening `<`
 * @param {string} tag
 * @returns {number} the index just past its closing tag, or the end
 */
function elementEnd(html, start, tag) {
  const pattern = new RegExp(`<(/?)${tag}\\b[^>]*>`, "gi");
  pattern.lastIndex = start;
  let depth = 0;
  for (let match = pattern.exec(html); match !== null; match = pattern.exec(html)) {
    depth += match[1] === "/" ? -1 : 1;
    if (depth === 0) {
      return match.index + match[0].length;
    }
  }
  return html.length;
}

/**
 * The first element whose opening tag matches `open`, whole.
 *
 * @param {string} html
 * @param {RegExp} open matches the opening tag; group 1 is the tag name
 * @returns {{ start: number, end: number } | null}
 */
function findElement(html, open) {
  const match = open.exec(html);
  if (match === null) {
    return null;
  }
  return { start: match.index, end: elementEnd(html, match.index, match[1] ?? "div") };
}

/**
 * Every element whose opening tag matches `open`, removed, in one pass: a
 * page can hide tens of thousands of spans.
 *
 * @param {string} html
 * @param {RegExp} open as for `findElement`, without the `g` flag
 * @returns {string}
 */
function dropElements(html, open) {
  const pattern = new RegExp(open.source, `${open.flags}g`);
  /** @type {string[]} */
  const kept = [];
  let from = 0;
  for (let match = pattern.exec(html); match !== null; match = pattern.exec(html)) {
    kept.push(html.slice(from, match.index));
    from = elementEnd(html, match.index, match[1] ?? "div");
    pattern.lastIndex = from;
  }
  kept.push(html.slice(from));
  return kept.join("");
}

/**
 * Inline text: tags gone, entities decoded, whitespace collapsed.
 *
 * @param {string} html
 * @returns {string}
 */
function inline(html) {
  return decodeEntities(html.replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * The part of the page that is the article: no navigation, no footer, no
 * Wayback toolbar, no edit links, nothing hidden.
 *
 * @param {string} html
 * @returns {string}
 */
function articleOf(html) {
  let body = html.replace(
    /<!-- BEGIN WAYBACK TOOLBAR INSERT -->[\s\S]*?<!-- END WAYBACK TOOLBAR INSERT -->/g,
    "",
  );
  const start = body.indexOf("<!-- start content -->");
  if (start >= 0) {
    body = body.slice(start);
  } else {
    const content = /<div[^>]*\bid="mw-content-text"/i.exec(body);
    body = content === null ? body : body.slice(content.index);
  }
  const end = /<div[^>]*\bclass="printfooter"|<div[^>]*\bid="catlinks"|<!-- end content -->/i.exec(
    body,
  );
  body = end === null ? body : body.slice(0, end.index);
  body = body
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, "")
    .replace(/<span class="mw-editsection-bracket">[^<]*<\/span>/g, "");
  for (const open of [
    /<(span)\b[^>]*\bclass="(?:mw-)?editsection"[^>]*>/i,
    /<(span)\b[^>]*\bclass="wikipopup hide"[^>]*>/i,
    /<(span|div)\b[^>]*\bstyle="display:\s*none;?"[^>]*>/i,
    /<(div)\b[^>]*\bid="(?:jump-to-nav|siteSub|contentSub|toc)"[^>]*>/i,
    /<(div|table)\b[^>]*\bclass="[^"]*\b(?:noprint|navbox)\b[^"]*"[^>]*>/i,
  ]) {
    body = dropElements(body, open);
  }
  return body;
}

/**
 * The skill infobox as `key: value` lines: its name, its costs (keyed by
 * their icon), and its `<dt>`/`<dd>` or `<th>`/`<td>` pairs.
 *
 * @param {string} box
 * @returns {string[]}
 */
function infoboxLines(box) {
  /** @type {string[]} */
  const lines = [];
  const name = /<p[^>]*\bclass="skill-name[^"]*"[^>]*>([\s\S]*?)<\/p>/i.exec(box);
  if (name !== null) {
    lines.push(`name: ${inline(name[1] ?? "")}`);
  }
  for (const [, item = ""] of box.matchAll(/<li\b[^>]*>([\s\S]*?)(?=<li\b|<\/li>|<\/ul>)/gi)) {
    const key = /<img\b[^>]*\balt="([^"]*)"/i.exec(item)?.[1];
    const value = inline(item);
    if (key !== undefined && value !== "") {
      lines.push(`${decodeEntities(key)}: ${value}`);
    }
  }
  for (const [, key = "", value = ""] of box.matchAll(
    /<(?:dt|th)\b[^>]*>([\s\S]*?)<\/(?:dt|th)>\s*<(?:dd|td)\b[^>]*>([\s\S]*?)(?=<\/?(?:dt|dd|th|td|tr|dl)\b)/gi,
  )) {
    if (inline(key) !== "" && inline(value) !== "") {
      lines.push(`${inline(key)}: ${inline(value)}`);
    }
  }
  return lines;
}

/**
 * The progression table of today's skill pages, which lays numbers out in
 * column divs, as one `name: n n n` line per row, as the old tables read.
 *
 * @param {string} table
 * @returns {string}
 */
function progressionLines(table) {
  const header = /<th\b[^>]*>([\s\S]*?)<\/th>/i.exec(table);
  /** @param {string} html */
  const cells = (html) =>
    [...html.matchAll(/<div class="(?:attr|var)">([\s\S]*?)<\/div>/gi)].map(([, c = ""]) =>
      inline(c),
    );
  const names = cells(/<td\b[^>]*>([\s\S]*?)<\/td>/i.exec(table)?.[1] ?? "");
  const columns = [...table.matchAll(/<div class="column"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/gi)].map(
    ([column]) => cells(column),
  );
  const rows = names.map((name, i) => `${name}: ${columns.map((c) => c[i] ?? "").join(" ")}`);
  return [inline(header?.[1] ?? ""), ...rows].join("\n");
}

/**
 * A wiki page as readable text: the skill infobox as `key: value` lines,
 * then the article paragraph by paragraph. Headings read as in wikitext
 * (`== Notes ==`), list items as `- `, table rows as `head: cell cell`.
 * A diff of this is what shows a patch's number change.
 *
 * @param {string} html
 * @returns {string}
 */
export function extractText(html) {
  let body = articleOf(html);

  /** @type {string[]} */
  let box = [];
  const found = findElement(
    body,
    /<(div|table)\b[^>]*\bclass="[^"]*\b(?:infobox|skill-details)\b/i,
  );
  if (found !== null) {
    box = infoboxLines(body.slice(found.start, found.end));
    body = body.slice(0, found.start) + body.slice(found.end);
  }

  const progression = findElement(body, /<(table)\b[^>]*\bclass="skill-progression"/i);
  if (progression !== null) {
    const text = progressionLines(body.slice(progression.start, progression.end));
    body = `${body.slice(0, progression.start)}\n${text}\n${body.slice(progression.end)}`;
  }

  const text = body
    .replace(/<h(\d)\b[^>]*>([\s\S]*?)<\/h\1>/gi, (_, level, inner) => {
      const marks = "=".repeat(Number(level));
      return `\n${marks} ${inline(String(inner))} ${marks}\n`;
    })
    .replace(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi, (_, /** @type {string} */ row) => {
      const cells = [...row.matchAll(/<(th|td)\b[^>]*>([\s\S]*?)(?=<\/?(?:th|td)\b|$)/gi)].map(
        ([, tag = "", cell = ""]) => ({ head: tag.toLowerCase() === "th", text: inline(cell) }),
      );
      const [first, ...rest] = cells;
      if (first === undefined) {
        return "\n";
      }
      const values = rest.map((cell) => cell.text).filter((t) => t !== "");
      return first.head && values.length > 0
        ? `\n${first.text}: ${values.join(" ")}\n`
        : `\n${[first, ...rest].map((cell) => cell.text).join(" | ")}\n`;
    })
    .replace(/<li\b[^>]*>/gi, "\n- ")
    .replace(/<br\s*\/?>|<\/?(?:p|div|ul|ol|dl|dt|dd|li|table|tbody|h\d)\b[^>]*>/gi, "\n");

  const lines = decodeEntities(text.replace(/<[^>]*>/g, ""))
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line !== "" && line !== "-");
  return [...box, ...(box.length > 0 ? [""] : []), ...lines].join("\n");
}

/* -------------------------------------------------------------------------- */
/* Diff                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * A unified diff of two texts, line by line: `null` if they are the same,
 * refused if what differs is too long to compare (`MAX_DIFF_CELLS`).
 *
 * @param {string} a
 * @param {string} b
 * @param {string} aLabel
 * @param {string} bLabel
 * @returns {{ ok: true, diff: string | null } | { ok: false, reason: string }}
 */
export function unifiedDiff(a, b, aLabel, bLabel) {
  const left = a.split("\n");
  const right = b.split("\n");
  const n = left.length;
  const m = right.length;
  // The lines both start and end with are not compared, only what is between.
  let head = 0;
  while (head < n && head < m && left[head] === right[head]) {
    head += 1;
  }
  let tail = 0;
  while (tail < n - head && tail < m - head && left[n - 1 - tail] === right[m - 1 - tail]) {
    tail += 1;
  }
  const rows = n - head - tail;
  const columns = m - head - tail;
  if (rows * columns > MAX_DIFF_CELLS) {
    return { ok: false, reason: "too long to diff" };
  }
  // The longest common subsequence of the middle, from its end.
  const lcs = new Uint32Array((rows + 1) * (columns + 1));
  /** @type {(i: number, j: number) => number} */
  const at = (i, j) => lcs[(i - head) * (columns + 1) + (j - head)] ?? 0;
  for (let i = n - tail - 1; i >= head; i -= 1) {
    for (let j = m - tail - 1; j >= head; j -= 1) {
      lcs[(i - head) * (columns + 1) + (j - head)] =
        left[i] === right[j] ? at(i + 1, j + 1) + 1 : Math.max(at(i + 1, j), at(i, j + 1));
    }
  }
  /** @type {{ op: " " | "-" | "+", line: string, i: number, j: number }[]} */
  const ops = [];
  for (let k = 0; k < head; k += 1) {
    ops.push({ op: " ", line: left[k] ?? "", i: k, j: k });
  }
  const endI = n - tail;
  const endJ = m - tail;
  let i = head;
  let j = head;
  while (i < endI || j < endJ) {
    if (i < endI && j < endJ && left[i] === right[j]) {
      ops.push({ op: " ", line: left[i] ?? "", i, j });
      i += 1;
      j += 1;
    } else if (i < endI && (j === endJ || at(i + 1, j) >= at(i, j + 1))) {
      ops.push({ op: "-", line: left[i] ?? "", i, j });
      i += 1;
    } else {
      ops.push({ op: "+", line: right[j] ?? "", i, j });
      j += 1;
    }
  }
  for (let k = 0; k < tail; k += 1) {
    ops.push({ op: " ", line: left[endI + k] ?? "", i: endI + k, j: endJ + k });
  }
  const changed = ops.flatMap((o, k) => (o.op === " " ? [] : [k]));
  if (changed.length === 0) {
    return { ok: true, diff: null };
  }

  // Changes closer than twice the context share a hunk.
  /** @type {[number, number][]} */
  const hunks = [];
  for (const k of changed) {
    const last = hunks.at(-1);
    if (last !== undefined && k - last[1] <= 2 * CONTEXT_LINES + 1) {
      last[1] = k;
    } else {
      hunks.push([k, k]);
    }
  }
  const out = [`--- ${aLabel}`, `+++ ${bLabel}`];
  for (const [first, last] of hunks) {
    const from = Math.max(0, first - CONTEXT_LINES);
    const to = Math.min(ops.length - 1, last + CONTEXT_LINES);
    const slice = ops.slice(from, to + 1);
    const leftCount = slice.filter((o) => o.op !== "+").length;
    const rightCount = slice.filter((o) => o.op !== "-").length;
    const head = slice[0];
    const leftStart = leftCount === 0 ? (head?.i ?? 0) : (head?.i ?? 0) + 1;
    const rightStart = rightCount === 0 ? (head?.j ?? 0) : (head?.j ?? 0) + 1;
    out.push(
      `@@ -${String(leftStart)},${String(leftCount)} +${String(rightStart)},${String(rightCount)} @@`,
      ...slice.map((o) => `${o.op}${o.line}`),
    );
  }
  return { ok: true, diff: out.join("\n") };
}

/* -------------------------------------------------------------------------- */
/* Fetching                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Read `url`, following a redirect only while it stays on one of
 * `origins`: hubd runs on the host, and a redirect elsewhere would let a
 * page answer with what the host can reach.
 *
 * @param {string} url
 * @param {{ live: string, archive: string }} origins
 * @param {WikiDeps} deps
 * @returns {Promise<{ ok: true, text: string } | { ok: false, reason: string }>}
 */
async function fetchText(url, origins, deps) {
  const allowed = [new URL(origins.live).origin, new URL(origins.archive).origin];
  const signal = AbortSignal.timeout(deps.timeoutMs ?? FETCH_TIMEOUT_MS);
  try {
    let at = url;
    for (let hops = 0; ; hops += 1) {
      const response = await deps.fetch(at, {
        headers: { "User-Agent": USER_AGENT },
        redirect: "manual",
        signal,
      });
      if (response.status < 300 || response.status >= 400) {
        if (!response.ok) {
          await response.body?.cancel();
          return { ok: false, reason: `HTTP ${String(response.status)}` };
        }
        const text = await bodyText(response);
        return text === null ? { ok: false, reason: "too large" } : { ok: true, text };
      }
      await response.body?.cancel();
      const location = response.headers.get("location");
      const next = location === null ? null : URL.parse(location, at);
      if (next === null || !allowed.includes(next.origin)) {
        return { ok: false, reason: "redirected off-site" };
      }
      if (hops === MAX_REDIRECTS) {
        return { ok: false, reason: "too many redirects" };
      }
      at = next.href;
    }
  } catch (error) {
    if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
      return { ok: false, reason: "timed out" };
    }
    return { ok: false, reason: `unreachable (${error instanceof Error ? error.message : "?"})` };
  }
}

/**
 * The body as text, or `null` past `MAX_PAGE_BYTES`, read no further.
 *
 * @param {Response} response
 * @returns {Promise<string | null>}
 */
async function bodyText(response) {
  if (response.body === null) {
    return "";
  }
  const decoder = new TextDecoder();
  const parts = [];
  let bytes = 0;
  for await (const chunk of response.body) {
    bytes += chunk.byteLength;
    if (bytes > MAX_PAGE_BYTES) {
      return null;
    }
    parts.push(decoder.decode(chunk, { stream: true }));
  }
  parts.push(decoder.decode());
  return parts.join("");
}

/**
 * @typedef {{ ok: true, url: string, label: string, html: string } | { ok: false, why: string }} Copy
 *   `label` is `live` or `snapshot YYYY-MM-DD`; `why` completes "no copy of <Page>"
 */

/**
 * One wiki request's reads: the snapshot list is fetched at most once.
 *
 * @param {string} page
 * @param {WikiDeps} deps
 */
function reader(page, deps) {
  const origins = deps.origins ?? { live: LIVE_ORIGIN, archive: ARCHIVE_ORIGIN };
  /** @type {Promise<{ ok: true, snapshots: Snapshot[] } | { ok: false, reason: string }> | null} */
  let listed = null;

  const snapshots = () => {
    listed ??= fetchText(cdxUrl(page, origins), origins, deps).then((answer) => {
      if (!answer.ok) {
        return answer;
      }
      const parsed = parseCdx(answer.text);
      return parsed === null
        ? { ok: /** @type {const} */ (false), reason: "answered something that is not CDX" }
        : { ok: /** @type {const} */ (true), snapshots: parsed };
    });
    return listed;
  };

  /**
   * The newest snapshot on or before `at` (any, if `null`) that is a page.
   *
   * @param {string | null} at
   * @returns {Promise<Copy>}
   */
  const snapshot = async (at) => {
    const list = await snapshots();
    if (!list.ok) {
      return { ok: false, why: `wayback ${list.reason}` };
    }
    const when = at === null ? "" : ` on or before ${at}`;
    const candidates = pickSnapshots(list.snapshots, at);
    if (candidates.length === 0) {
      return { ok: false, why: `wayback none${when}` };
    }
    let last = "none";
    for (const candidate of candidates.slice(0, MAX_SNAPSHOT_TRIES)) {
      const url = snapshotUrl(page, candidate.timestamp, origins);
      const answer = await fetchText(url, origins, deps);
      if (answer.ok && !isMaintenance(answer.text)) {
        return {
          ok: true,
          url,
          label: `snapshot ${snapshotDate(candidate.timestamp)}`,
          html: answer.text,
        };
      }
      last = answer.ok ? "maintenance" : answer.reason;
    }
    return { ok: false, why: `wayback ${last}${when}` };
  };

  return {
    snapshots,
    snapshot,
    /**
     * The live page, or the newest snapshot when the live one is not there.
     *
     * @returns {Promise<Copy>}
     */
    async live() {
      const url = liveUrl(page, origins);
      const answer = await fetchText(url, origins, deps);
      if (answer.ok && !isMaintenance(answer.text)) {
        return { ok: true, url, label: "live", html: answer.text };
      }
      const fallback = await snapshot(null);
      return fallback.ok
        ? fallback
        : { ok: false, why: `live ${answer.ok ? "maintenance" : answer.reason}, ${fallback.why}` };
    },
  };
}

/**
 * Serve one `hub wiki` request: what `hub` prints, and its exit code.
 *
 * @param {string[]} argv the words after `hub wiki`
 * @param {WikiDeps} deps
 * @returns {Promise<{ code: number, stdout: string, stderr: string }>}
 */
export async function runWiki(argv, deps) {
  const request = parseWikiRequest(argv);
  if ("error" in request) {
    return { code: 2, stdout: "", stderr: `hub wiki: ${request.error}\n` };
  }
  const read = reader(request.page, deps);
  /** @param {string} why */
  const noCopy = (why) => ({
    code: 1,
    stdout: "",
    stderr: `no copy of ${request.page}: ${why}\n`,
  });

  if (request.verb === "get") {
    const copy = request.at === null ? await read.live() : await read.snapshot(request.at);
    if (!copy.ok) {
      return noCopy(copy.why);
    }
    return {
      code: 0,
      stdout: `source: ${copy.url} (${copy.label})\n\n${extractText(copy.html)}\n`,
      stderr: "",
    };
  }

  if (request.verb === "history") {
    const list = await read.snapshots();
    if (!list.ok) {
      return noCopy(`wayback ${list.reason}`);
    }
    if (list.snapshots.length === 0) {
      return noCopy("wayback none");
    }
    const lines = pickSnapshots(list.snapshots, null).map(
      (s) => `${snapshotDate(s.timestamp)} ${s.digest}`,
    );
    return { code: 0, stdout: `${lines.join("\n")}\n`, stderr: "" };
  }

  const from = await read.snapshot(request.from);
  if (!from.ok) {
    return noCopy(from.why);
  }
  const to = request.to === "live" ? await read.live() : await read.snapshot(request.to);
  if (!to.ok) {
    return noCopy(to.why);
  }
  const diff = unifiedDiff(
    extractText(from.html),
    extractText(to.html),
    `${from.url} (${from.label})`,
    `${to.url} (${to.label})`,
  );
  if (!diff.ok) {
    return { code: 1, stdout: "", stderr: `no diff of ${request.page}: ${diff.reason}\n` };
  }
  return { code: 0, stdout: `${diff.diff ?? "no change"}\n`, stderr: "" };
}
