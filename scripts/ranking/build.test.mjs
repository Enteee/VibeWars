/**
 * The leaderboard job (#3574), with the relays faked: it merges, skips
 * junk, never forgets a receipt, and writes the same bytes twice.
 */

import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { schnorr } from "@noble/secp256k1";
import { parseReceipt, resultDigest, startDigest, startHash, ZERO_HASH } from "@vibewars/ranking";
import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchRelay, run } from "./build.mjs";

/** @typedef {import("@vibewars/ranking").RankedReceipt} RankedReceipt */
/** @typedef {{ kind: number, tags: string[][], content: string }} RelayEvent */

/** @param {Uint8Array} bytes */
const sha256 = (bytes) => new Uint8Array(createHash("sha256").update(bytes).digest());
const hex = (/** @type {Uint8Array} */ bytes) => Buffer.from(bytes).toString("hex");

/** Four seats, each a real BIP-340 key. */
const KEYS = Array.from({ length: 4 }, () => {
  const { secretKey, publicKey } = schnorr.keygen();
  return {
    pubkey: hex(publicKey),
    /** @param {Uint8Array} digest */
    sign: (digest) => hex(schnorr.sign(digest, secretKey)),
  };
});
/** 2026-11-20, in days and seconds. */
const DAY = 20_412;

/**
 * A 2v2 receipt, team 0 winning, signed by every seat but `leavers`
 * and `unsigned`, and by `only` alone when given (a partial).
 * @param {{ matchId: string, leavers?: string[], only?: string, at?: number }} play
 * @returns {RankedReceipt}
 */
function receipt({ matchId, leavers = [], only, at = 0 }) {
  const seats = KEYS.map((key) => key.pubkey);
  const start = {
    matchId,
    buildHash: "build",
    mode: "team-arena",
    map: "isle",
    seed: 1,
    startedAt: DAY * 86_400 + 3_600 + at,
    leaderboardAsOf: 0,
    teams: [seats.slice(0, 2), seats.slice(2)].map((team) =>
      team.map((pubkey) => ({
        pubkey,
        characterId: "starter",
        name: `N${pubkey.slice(0, 4)}`,
        claimedRating: 800,
        prev: ZERO_HASH,
      })),
    ),
  };
  const result = {
    startHash: startHash(start, sha256),
    winningTeam: 0,
    endReason: "annihilation",
    leavers,
    durationSeconds: 300,
    replayHash: "ab".repeat(32),
  };
  const startOf = startDigest(start, sha256);
  const resultOf = resultDigest(result, sha256);
  const signers = KEYS.filter(
    (key) => !leavers.includes(key.pubkey) && (only === undefined || key.pubkey === only),
  );
  return {
    start,
    startSigs: Object.fromEntries(KEYS.map((key) => [key.pubkey, key.sign(startOf)])),
    result,
    resultSigs: Object.fromEntries(signers.map((key) => [key.pubkey, key.sign(resultOf)])),
  };
}

/**
 * `receipt` as a relay holds it, under `suffix` below its match's address.
 * @param {RankedReceipt | string} receipt
 * @returns {RelayEvent}
 */
function event(receipt, suffix = "") {
  const matchId = typeof receipt === "string" ? "junk" : receipt.start.matchId;
  return {
    kind: 30078,
    tags: [
      ["d", `vibewars-ranked/${matchId}${suffix}`],
      ["t", "vibewars-ranked"],
    ],
    content: typeof receipt === "string" ? receipt : JSON.stringify(receipt),
  };
}

const RELAYS = ["wss://a.example", "wss://b.example"];
/** @type {string[]} */
const dirs = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
const archiveDir = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ranking-"));
  dirs.push(dir);
  return dir;
};

/**
 * One run on `dir` against relays that hold `held` (`undefined`: down).
 * @param {string} dir
 * @param {(RelayEvent[] | undefined)[]} held
 */
async function runOn(dir, held) {
  /** @type {(number | undefined)[]} */
  const asked = [];
  const out = await run({
    dir,
    asOfDay: DAY,
    relays: RELAYS,
    fetch: (relay, since) => {
      asked.push(since);
      return Promise.resolve(held[RELAYS.indexOf(relay)]);
    },
  });
  return { ...out, asked };
}

/**
 * The shard a receipt started at `startedAt` goes in: its UTC month.
 * @param {number} startedAt
 */
const monthOf = (startedAt) => new Date(startedAt * 1000).toISOString().slice(0, 7);

/**
 * Every archived receipt line, shards in name order.
 * @param {{ shards: Record<string, string> }} out
 */
const linesOf = ({ shards }) =>
  Object.keys(shards)
    .sort()
    .flatMap((month) => (shards[month] ?? "").split("\n").filter(Boolean));

/** @typedef {{ asOf: number, count: number, entries: { pubkey: string, matches: number }[] }} Board */
/** @param {string} leaderboard */
const entriesOf = (leaderboard) => {
  /** @type {unknown} */
  const parsed = JSON.parse(leaderboard);
  return /** @type {Board} */ (parsed);
};

describe("the leaderboard job", () => {
  it("rates a match, and writes the same bytes on a second run", async () => {
    const dir = archiveDir();
    const match = receipt({ matchId: "m1" });
    const first = await runOn(dir, [[event(match)], [event(match)]]);
    const board = entriesOf(first.leaderboard);
    expect(board.count).toBe(4);
    expect(board.entries.every((entry) => entry.matches === 1)).toBe(true);
    expect(board.asOf).toBe(match.start.startedAt);
    expect(linesOf(first)).toHaveLength(1);
    expect(first.asked).toEqual([undefined, undefined]);

    const second = await runOn(dir, [[event(match)], [event(match)]]);
    expect(second.shards).toEqual(first.shards);
    expect(second.leaderboard).toBe(first.leaderboard);
    const third = await runOn(dir, [[event(match)], [event(match)]]);
    expect(third).toEqual(second);
    expect(second.asked).toEqual([
      match.start.startedAt - 2 * 86_400,
      match.start.startedAt - 2 * 86_400,
    ]);
    const hash = createHash("sha256").update(first.leaderboard).digest("hex");
    expect(first.log).toContain(`leaderboard.json sha256: ${hash}`);
  });

  it("merges partial copies of one result into one receipt", async () => {
    const dir = archiveDir();
    const [a, b, c, d] = KEYS.map((key) => key.pubkey);
    const partials = [a, b, c, d].map((only) => receipt({ matchId: "m1", only }));
    await runOn(dir, [partials.slice(0, 2).map((p) => event(p, "/r1/x")), undefined]);
    const out = await runOn(dir, [undefined, partials.slice(2).map((p) => event(p, "/r1/y"))]);
    const { leaderboard } = out;
    const lines = linesOf(out);
    expect(lines).toHaveLength(1);
    expect(Object.keys(parseReceipt(lines[0] ?? "")?.resultSigs ?? {})).toHaveLength(4);
    expect(entriesOf(leaderboard).entries.every((entry) => entry.matches === 1)).toBe(true);
  });

  it("skips and counts junk, and keeps the archive when every relay is down", async () => {
    const dir = archiveDir();
    const match = receipt({ matchId: "m1" });
    const forged = {
      ...match,
      startSigs: { ...match.startSigs, [KEYS[0]?.pubkey ?? ""]: "00".repeat(64) },
    };
    const elsewhere = {
      ...event(match),
      tags: [
        ["d", "vibewars-ranked/other"],
        ["t", "vibewars-ranked"],
      ],
    };
    const first = await runOn(dir, [
      [event(match), event("{not json"), event(forged), elsewhere],
      [],
    ]);
    expect(first.log).toMatch(/malformed: 2\n/);
    expect(first.log).toMatch(/start-signature: 1\n/);

    const down = await runOn(dir, [undefined, undefined]);
    expect(down.shards).toEqual(first.shards);
    expect(down.leaderboard).toBe(first.leaderboard);
    expect(down.log).toContain("no relay reached: the archive is unchanged");
  });

  it("takes in no receipt from after the as-of day, so none pins since or asOf", async () => {
    const dir = archiveDir();
    const match = receipt({ matchId: "m1" });
    const future = receipt({ matchId: "m2", at: 80 * 365 * 86_400 });
    const first = await runOn(dir, [[event(match), event(future)], []]);
    expect(first.log).toMatch(/future: 1\n/);
    expect(linesOf(first)).toHaveLength(1);

    // An archive built as of a later day holds it: it still pins nothing.
    const shard = path.join(dir, "receipts", `${monthOf(future.start.startedAt)}.ndjson`);
    fs.writeFileSync(shard, `${JSON.stringify(future)}\n`);
    const second = await runOn(dir, [[], []]);
    expect(second.asked).toEqual(RELAYS.map(() => match.start.startedAt - 2 * 86_400));
    expect(entriesOf(second.leaderboard).asOf).toBe(match.start.startedAt);
  });

  it("voids a re-round that names a signer a leaver, and rates one no winner backs", async () => {
    const [w, , x, y] = KEYS.map((key) => key.pubkey);
    if (w === undefined || x === undefined || y === undefined) {
      throw new Error("four keys");
    }
    const reRounded = archiveDir();
    const final = receipt({ matchId: "m1", leavers: [x] });
    /** @param {string} key */
    const partial = (key) => event(receipt({ matchId: "m1", only: key }), `/r1/${key}`);
    const voided = entriesOf(
      (await runOn(reRounded, [[event(final), partial(x)], [partial(w)]])).leaderboard,
    );
    expect(voided.entries.every((entry) => entry.matches === 0)).toBe(true);

    // x's own partial, alone or beside a loser's, is no evidence; nor is a
    // partial from y, who really refused.
    for (const partials of [[partial(x)], [partial(x), partial(y)], [partial(y)]]) {
      const rated = entriesOf(
        (await runOn(archiveDir(), [[event(final), ...partials], []])).leaderboard,
      );
      // Rated, not void: which way it moves each key is rate.test.ts's to show.
      expect(rated.entries.every((entry) => entry.matches === 1)).toBe(true);
    }
  });
});

/** @typedef {{ id: string, created_at: number }} Stored */
/**
 * A NIP-01 relay holding `store`, as a `WebSocket`: newest first,
 * `since` and `until` inclusive, at most `limit` and `cap` a page.
 * @param {Stored[]} store
 * @param {number} cap
 */
function fakeRelay(store, cap) {
  return class {
    /** @type {Map<string, ((event: { data?: string }) => void)[]>} */
    listeners = new Map();
    closed = false;
    constructor() {
      setTimeout(() => {
        this.emit("open", {});
      });
    }
    /** @param {string} type @param {(event: { data?: string }) => void} listener */
    addEventListener(type, listener) {
      this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
    }
    /** @param {string} type @param {{ data?: string }} event */
    emit(type, event) {
      for (const listener of this.closed ? [] : (this.listeners.get(type) ?? [])) {
        listener(event);
      }
    }
    /** @param {string} json */
    send(json) {
      /** @type {unknown} */
      const parsed = JSON.parse(json);
      const [verb, sub, filter] =
        /** @type {[string, string, { since?: number, until?: number, limit: number }]} */ (parsed);
      if (verb !== "REQ") {
        return;
      }
      const page = store
        .filter(
          ({ created_at: at }) =>
            at >= (filter.since ?? -Infinity) && at <= (filter.until ?? Infinity),
        )
        .sort((a, b) => b.created_at - a.created_at)
        .slice(0, Math.min(filter.limit, cap));
      setTimeout(() => {
        for (const event of page) {
          this.emit("message", { data: JSON.stringify(["EVENT", sub, event]) });
        }
        this.emit("message", { data: JSON.stringify(["EOSE", sub]) });
      });
    }
    close() {
      this.closed = true;
    }
  };
}

describe("the archive's month shards (#3730)", () => {
  const lastMonth = -31 * 86_400;

  it("puts receipts of two months in two shards, and rewrites only the one that changed", async () => {
    const dir = archiveDir();
    const old = receipt({ matchId: "m1", at: lastMonth });
    const now = receipt({ matchId: "m2" });
    const first = await runOn(dir, [[event(old), event(now)], []]);
    const oldMonth = monthOf(old.start.startedAt);
    const nowMonth = monthOf(now.start.startedAt);
    expect(oldMonth).not.toBe(nowMonth);
    expect(Object.keys(first.shards).sort()).toEqual([oldMonth, nowMonth]);
    const files = fs.readdirSync(path.join(dir, "receipts")).sort();
    expect(files).toEqual([`${oldMonth}.ndjson`, `${nowMonth}.ndjson`]);

    const oldFile = path.join(dir, "receipts", `${oldMonth}.ndjson`);
    const nowFile = path.join(dir, "receipts", `${nowMonth}.ndjson`);
    /** @param {string} file */
    const written = (file) => fs.statSync(file).mtimeMs;
    const past = new Date(0);
    fs.utimesSync(oldFile, past, past);
    fs.utimesSync(nowFile, past, past);
    const second = await runOn(dir, [[event(receipt({ matchId: "m3", at: 60 }))], []]);
    expect(linesOf(second)).toHaveLength(3);
    expect(written(oldFile)).toBe(0);
    expect(written(nowFile)).not.toBe(0);
    expect(fs.readFileSync(oldFile, "utf8")).toBe(first.shards[oldMonth]);
  });

  it("fails before writing anything when a shard would be too big", async () => {
    const dir = archiveDir();
    const match = receipt({ matchId: "m1" });
    await expect(
      run({
        dir,
        asOfDay: DAY,
        relays: RELAYS,
        fetch: () => Promise.resolve([event(match)]),
        shardLimit: 100,
      }),
    ).rejects.toThrow(/over 100 bytes.*\d{4}-\d{2}\.ndjson/);
    expect(fs.readdirSync(dir)).toEqual([]);
  });
});

describe("fetchRelay", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each([500, 100])("pages past a page of spam in one second, %i a page", async (cap) => {
    const real = Array.from({ length: 30 }, (_, i) => ({
      id: `real-${String(i)}`,
      created_at: 1000 + i,
    }));
    const spam = Array.from({ length: 500 }, (_, i) => ({
      id: `spam-${String(i)}`,
      created_at: 2000,
    }));
    vi.stubGlobal("WebSocket", fakeRelay([...real, ...spam], cap));
    const events = /** @type {Stored[]} */ ((await fetchRelay("wss://a.example", 0)) ?? []);
    expect(events.filter(({ id }) => id.startsWith("real-"))).toHaveLength(real.length);
  });
});
