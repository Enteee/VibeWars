import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { WEB_CACHE_LIMIT_BYTES, createWebCache, parseIndex } from "./web-cache.mjs";
import { LIVE_TTL_MS } from "./wiki.mjs";

const HOLD = 1_000;

/** @type {string} */
let dir;
/** @type {number} */
let clock;
/** @type {number} */
let free;
/** @type {string[]} */
let logged;

beforeEach(() => {
  dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "web-cache-")), "web-cache");
  clock = 1_800_000_000_000;
  free = 10 * HOLD;
  logged = [];
});

afterEach(() => {
  fs.rmSync(path.dirname(dir), { recursive: true, force: true });
});

/** @param {{ limitBytes?: number }} [options] */
function open({ limitBytes } = {}) {
  return createWebCache({
    dir,
    ...(limitBytes === undefined ? {} : { limitBytes }),
    now: () => clock,
    freeBytes: () => free,
    holdBelow: HOLD,
    log: (line) => {
      logged.push(line);
    },
  });
}

/**
 * A read that answers `text`, counting its calls.
 *
 * @param {string} text
 */
function loader(text) {
  const calls = { n: 0 };
  /** @returns {Promise<import("./web-cache.mjs").Answer>} */
  const load = () => {
    calls.n += 1;
    return Promise.resolve({ ok: true, text });
  };
  return { calls, load };
}

const keep = () => true;

describe("the web cache (#1381)", () => {
  it("serves a hit without fetching, across a restart", async () => {
    const page = loader("<p>Mind Blast</p>");
    const first = await open().get("u", { ttlMs: LIVE_TTL_MS, load: page.load, keep });
    const again = await open().get("u", { ttlMs: LIVE_TTL_MS, load: page.load, keep });
    expect(first).toEqual({ ok: true, text: "<p>Mind Blast</p>" });
    expect(again).toEqual(first);
    expect(page.calls.n).toBe(1);
  });

  it("keeps a snapshot for good, and refetches a live page after 24 h", async () => {
    const cache = open();
    const snapshot = loader("old");
    const live = loader("new");
    await cache.get("snap", { ttlMs: Infinity, load: snapshot.load, keep });
    await cache.get("live", { ttlMs: LIVE_TTL_MS, load: live.load, keep });
    clock += LIVE_TTL_MS - 1;
    await cache.get("live", { ttlMs: LIVE_TTL_MS, load: live.load, keep });
    expect(live.calls.n).toBe(1);
    clock += 365 * LIVE_TTL_MS;
    await cache.get("snap", { ttlMs: Infinity, load: snapshot.load, keep });
    await cache.get("live", { ttlMs: LIVE_TTL_MS, load: live.load, keep });
    expect(snapshot.calls.n).toBe(1);
    expect(live.calls.n).toBe(2);
    // The stale read was a miss.
    expect(cache.stats()).toMatchObject({ hits: 2, misses: 3 });
  });

  it("stores neither a failed read nor what keep refuses", async () => {
    const cache = open();
    /** @returns {Promise<import("./web-cache.mjs").Answer>} */
    const failing = () => Promise.resolve({ ok: false, reason: "HTTP 503" });
    const maintenance = loader("maintenance");
    expect(await cache.get("a", { ttlMs: Infinity, load: failing, keep })).toEqual({
      ok: false,
      reason: "HTTP 503",
    });
    await cache.get("b", { ttlMs: Infinity, load: maintenance.load, keep: () => false });
    await cache.get("b", { ttlMs: Infinity, load: maintenance.load, keep: () => false });
    expect(maintenance.calls.n).toBe(2);
    expect(cache.stats()).toMatchObject({ entries: 0, bytes: 0 });
  });

  it("evicts the least recently used first, never the one just stored", async () => {
    const cache = open({ limitBytes: 10 });
    await cache.get("a", { ttlMs: Infinity, load: loader("aaaa").load, keep });
    clock += 1;
    await cache.get("b", { ttlMs: Infinity, load: loader("bbbb").load, keep });
    clock += 1;
    // Using a makes b the oldest.
    await cache.get("a", { ttlMs: Infinity, load: loader("x").load, keep });
    clock += 1;
    await cache.get("c", { ttlMs: Infinity, load: loader("cccc").load, keep });
    expect(cache.stats()).toMatchObject({ entries: 2, bytes: 8, evictions: 1 });
    const b = loader("bbbb");
    await cache.get("b", { ttlMs: Infinity, load: b.load, keep });
    expect(b.calls.n).toBe(1);

    clock += 1;
    await cache.get("big", { ttlMs: Infinity, load: loader("0123456789ab").load, keep });
    expect(cache.stats()).toMatchObject({ entries: 1, bytes: 12 });
    expect(logged).toEqual(["hubd: web cache: big alone is over the limit, kept"]);
  });

  it("serves and does not store below the disk guard", async () => {
    free = HOLD - 1;
    const cache = open();
    const page = loader("page");
    expect(await cache.get("u", { ttlMs: Infinity, load: page.load, keep })).toEqual({
      ok: true,
      text: "page",
    });
    await cache.get("u", { ttlMs: Infinity, load: page.load, keep });
    expect(page.calls.n).toBe(2);
    expect(cache.stats().entries).toBe(0);
  });

  it("fetches once for two requests at once, and serves both", async () => {
    const cache = open();
    /** @type {{ resolve: (answer: import("./web-cache.mjs").Answer) => void }} */
    const fetched = { resolve: () => undefined };
    let calls = 0;
    /** @returns {Promise<import("./web-cache.mjs").Answer>} */
    const load = () => {
      calls += 1;
      return new Promise((resolve) => {
        fetched.resolve = resolve;
      });
    };
    const one = cache.get("u", { ttlMs: Infinity, load, keep });
    const two = cache.get("u", { ttlMs: Infinity, load, keep });
    fetched.resolve({ ok: true, text: "page" });
    expect(await Promise.all([one, two])).toEqual([
      { ok: true, text: "page" },
      { ok: true, text: "page" },
    ]);
    expect(calls).toBe(1);
    expect(cache.stats()).toMatchObject({ hits: 1, misses: 1, bytesSaved: 4 });
  });

  it("starts empty on a corrupt index, deleting the bodies once", async () => {
    await open().get("u", { ttlMs: Infinity, load: loader("page").load, keep });
    fs.writeFileSync(path.join(dir, "index.json"), "{ not json");
    const cache = open();
    expect(cache.stats()).toMatchObject({ entries: 0, hits: 0, misses: 0 });
    expect(fs.readdirSync(dir)).toEqual([]);
    expect(logged).toEqual([
      "hubd: web cache: no readable index.json, starting empty (2 files deleted)",
    ]);
    expect(parseIndex(JSON.stringify({ entries: [{ url: "u" }], hits: 0 }))).toBeNull();
  });

  it("leaves no entry and no partial body when a write fails", async () => {
    const cache = open();
    // A directory where the body goes makes its rename fail.
    const body = path.join(dir, "0bfe935e70c321c7ca3afc75ce0d0ca2f98b5422e008bb31c00c6d7f1f1c0ad6");
    fs.mkdirSync(body);
    fs.writeFileSync(path.join(body, "x"), "");
    expect(await cache.get("u", { ttlMs: Infinity, load: loader("page").load, keep })).toEqual({
      ok: true,
      text: "page",
    });
    expect(cache.stats().entries).toBe(0);
    expect(fs.existsSync(`${body}.tmp`)).toBe(false);
    expect(logged).toHaveLength(1);
  });

  it("adds up its stats", async () => {
    const cache = open();
    expect(cache.stats()).toEqual({
      entries: 0,
      bytes: 0,
      limitBytes: WEB_CACHE_LIMIT_BYTES,
      hits: 0,
      misses: 0,
      evictions: 0,
      bytesSaved: 0,
      hitRate: null,
    });
    await cache.get("a", { ttlMs: Infinity, load: loader("ü").load, keep });
    await cache.get("a", { ttlMs: Infinity, load: loader("").load, keep });
    await cache.get("a", { ttlMs: Infinity, load: loader("").load, keep });
    await cache.get("b", { ttlMs: Infinity, load: loader("bb").load, keep });
    expect(cache.stats()).toEqual({
      entries: 2,
      bytes: 4,
      limitBytes: WEB_CACHE_LIMIT_BYTES,
      hits: 2,
      misses: 2,
      evictions: 0,
      bytesSaved: 4,
      hitRate: 0.5,
    });
  });
});
