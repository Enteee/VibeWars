/**
 * hubd's web cache (#1381): what `hub wiki` reads, kept on the host so a
 * page asked for twice is fetched once. Bodies live in `.bots/web-cache/`,
 * which no jail binds, one file per URL named by its sha256, beside an
 * `index.json` of the entries and the cache's stats.
 *
 * The index is written at most once per `flushMs` for counters and recency, at
 * once after an eviction, and by `flush`. A crash loses at most `flushMs` of
 * them: the start-up sweep deletes bodies the index does not name.
 *
 * At most `limitBytes` is kept: after a store, the least recently used
 * entries go first, never the one just stored. Below the disk guard's
 * `HOLD_BELOW` free, a body is served and not stored.
 *
 * The cache does not fetch: `get` is given the read, and what it answers
 * is stored only when it is ok and `keep` agrees.
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

/** The most the cache keeps on disk. */
export const WEB_CACHE_LIMIT_BYTES = 10 * 2 ** 30;

/** The least time between two writes of the index that only a hit or a miss asked for. */
export const WEB_CACHE_FLUSH_MS = 10_000;

const INDEX = "index.json";

/**
 * @typedef {{ url: string, bytes: number, fetchedAt: number, usedAt: number }} Entry
 * @typedef {{ entries: Entry[], hits: number, misses: number, evictions: number,
 *   bytesSaved: number }} Index
 * @typedef {{ ok: true, text: string } | { ok: false, reason: string }} Answer
 * @typedef {{ entries: number, bytes: number, limitBytes: number, hits: number,
 *   misses: number, evictions: number, bytesSaved: number, hitRate: number | null }} WebCacheStats
 */

/**
 * @typedef {object} WebCacheDeps
 * @property {string} dir created if missing
 * @property {number} [limitBytes] `WEB_CACHE_LIMIT_BYTES` by default
 * @property {() => number} [now] `Date.now` by default
 * @property {number} [flushMs] `WEB_CACHE_FLUSH_MS` by default
 * @property {() => number} freeBytes on the cache's filesystem
 * @property {number} holdBelow free bytes under which nothing is stored
 * @property {(line: string) => void} log hubd's log
 */

/**
 * @param {string} url
 * @returns {string}
 */
function bodyName(url) {
  return crypto.createHash("sha256").update(url).digest("hex");
}

/**
 * @param {unknown} value
 * @returns {value is Entry}
 */
function isEntry(value) {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const { url, bytes, fetchedAt, usedAt } = /** @type {Record<string, unknown>} */ (value);
  return (
    typeof url === "string" &&
    [bytes, fetchedAt, usedAt].every((n) => typeof n === "number" && Number.isFinite(n))
  );
}

/**
 * `index.json`, or `null` for one that does not parse or is not an index.
 *
 * @param {string} text
 * @returns {Index | null}
 */
export function parseIndex(text) {
  /** @type {unknown} */
  let raw;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof raw !== "object" || raw === null) {
    return null;
  }
  const { entries, hits, misses, evictions, bytesSaved } = /** @type {Record<string, unknown>} */ (
    raw
  );
  if (
    !Array.isArray(entries) ||
    !entries.every(isEntry) ||
    ![hits, misses, evictions, bytesSaved].every(
      (n) => typeof n === "number" && Number.isInteger(n) && n >= 0,
    )
  ) {
    return null;
  }
  return /** @type {Index} */ ({ entries, hits, misses, evictions, bytesSaved });
}

/**
 * The cache on `dir`. A corrupt or missing index starts it empty: its
 * bodies are deleted, and the log says so once.
 *
 * @param {WebCacheDeps} deps
 */
export function createWebCache(deps) {
  const { dir, freeBytes, holdBelow, log } = deps;
  const limitBytes = deps.limitBytes ?? WEB_CACHE_LIMIT_BYTES;
  const now = deps.now ?? Date.now;
  const flushMs = deps.flushMs ?? WEB_CACHE_FLUSH_MS;
  fs.mkdirSync(dir, { recursive: true });

  /** @type {Index} */
  let index = { entries: [], hits: 0, misses: 0, evictions: 0, bytesSaved: 0 };
  const indexFile = path.join(dir, INDEX);
  const found = fs.existsSync(indexFile) ? parseIndex(fs.readFileSync(indexFile, "utf8")) : null;
  if (found === null) {
    const stale = fs.readdirSync(dir);
    for (const name of stale) {
      fs.rmSync(path.join(dir, name), { force: true, recursive: true });
    }
    if (stale.length > 0) {
      log(
        `hubd: web cache: no readable ${INDEX}, starting empty (${String(stale.length)} files deleted)`,
      );
    }
  } else {
    index = found;
  }
  /** @type {Map<string, Entry>} */
  const byUrl = new Map(index.entries.map((entry) => [entry.url, entry]));
  // A body the index does not name was stored by a write the index missed.
  const named = new Set([INDEX, ...[...byUrl.keys()].map(bodyName)]);
  for (const name of fs.readdirSync(dir)) {
    if (!named.has(name)) {
      fs.rmSync(path.join(dir, name), { force: true, recursive: true });
    }
  }
  /** @type {Map<string, Promise<Answer>>} */
  const inFlight = new Map();
  let bytes = [...byUrl.values()].reduce((sum, entry) => sum + entry.bytes, 0);
  let dirty = false;
  let lastSave = now();

  /**
   * The index, written whole; a failed write is logged, the request still
   * served, and the index stays dirty for the next eligible `touch` or `flush`.
   */
  const save = () => {
    lastSave = now();
    index.entries = [...byUrl.values()];
    const tmp = path.join(dir, `.${INDEX}.tmp`);
    try {
      fs.writeFileSync(tmp, JSON.stringify(index));
      fs.renameSync(tmp, indexFile);
      dirty = false;
    } catch (error) {
      fs.rmSync(tmp, { force: true });
      log(
        `hubd: web cache: ${INDEX} not written, ${error instanceof Error ? error.message : "failed"}`,
      );
    }
  };

  /** The index changed: write it if `flushMs` has passed since the last write. */
  const touch = () => {
    dirty = true;
    if (now() - lastSave >= flushMs) {
      save();
    }
  };

  /** @param {Entry} entry */
  const drop = (entry) => {
    byUrl.delete(entry.url);
    bytes -= entry.bytes;
    fs.rmSync(path.join(dir, bodyName(entry.url)), { force: true });
  };

  /**
   * Keep `text` for `url`, then evict down to the limit. A write that fails
   * leaves no entry and no partial body.
   *
   * @param {string} url
   * @param {string} text
   * @returns {void}
   */
  const store = (url, text) => {
    if (freeBytes() < holdBelow) {
      return;
    }
    const body = path.join(dir, bodyName(url));
    const tmp = `${body}.tmp`;
    try {
      fs.writeFileSync(tmp, text);
      fs.renameSync(tmp, body);
    } catch (error) {
      fs.rmSync(tmp, { force: true });
      log(`hubd: web cache: not stored, ${error instanceof Error ? error.message : "failed"}`);
      return;
    }
    const at = now();
    const stored = { url, bytes: Buffer.byteLength(text), fetchedAt: at, usedAt: at };
    bytes += stored.bytes - (byUrl.get(url)?.bytes ?? 0);
    byUrl.set(url, stored);
    dirty = true;
    if (bytes <= limitBytes) {
      return;
    }
    const oldestFirst = [...byUrl.values()].sort((a, b) => a.usedAt - b.usedAt);
    for (const entry of oldestFirst) {
      if (bytes <= limitBytes) {
        break;
      }
      if (entry !== stored) {
        drop(entry);
        index.evictions += 1;
      }
    }
    if (bytes > limitBytes) {
      log(`hubd: web cache: ${url} alone is over the limit, kept`);
    }
    // Bodies were deleted: the index must not name them for long.
    save();
  };

  /** Write the index if it changed since the last write. */
  const flush = () => {
    if (dirty) {
      save();
    }
  };

  /** @param {number} bytes */
  const hit = (bytes) => {
    index.hits += 1;
    index.bytesSaved += bytes;
  };

  return {
    /**
     * The body of `url`: from the cache while it is younger than `ttlMs`,
     * else from `load`. A stale entry refetched is a miss. A request for a
     * URL already being fetched waits for that fetch, and is a hit if it
     * answers.
     *
     * @param {string} url
     * @param {{ ttlMs: number, load: () => Promise<Answer>, keep: (text: string) => boolean }} how
     * @returns {Promise<Answer>}
     */
    async get(url, { ttlMs, load, keep }) {
      const entry = byUrl.get(url);
      if (entry !== undefined && now() - entry.fetchedAt < ttlMs) {
        /** @type {string | null} */
        let text = null;
        try {
          text = fs.readFileSync(path.join(dir, bodyName(url)), "utf8");
        } catch {
          drop(entry);
        }
        if (text !== null) {
          entry.usedAt = now();
          hit(entry.bytes);
          touch();
          return { ok: true, text };
        }
      }
      const pending = inFlight.get(url);
      if (pending !== undefined) {
        const answer = await pending;
        if (answer.ok) {
          hit(Buffer.byteLength(answer.text));
        } else {
          index.misses += 1;
        }
        touch();
        return answer;
      }
      index.misses += 1;
      const fetched = load()
        .then((answer) => {
          if (answer.ok && keep(answer.text)) {
            store(url, answer.text);
          }
          touch();
          return answer;
        })
        .finally(() => {
          inFlight.delete(url);
        });
      inFlight.set(url, fetched);
      return fetched;
    },

    flush,

    /** @returns {WebCacheStats} */
    stats() {
      flush();
      const { hits, misses, evictions, bytesSaved } = index;
      return {
        entries: byUrl.size,
        bytes,
        limitBytes,
        hits,
        misses,
        evictions,
        bytesSaved,
        hitRate: hits + misses === 0 ? null : hits / (hits + misses),
      };
    },
  };
}

/** @typedef {ReturnType<typeof createWebCache>} WebCache */
