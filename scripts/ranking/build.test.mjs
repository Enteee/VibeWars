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

import { BOARD_KEPT_SECONDS, fetchRelay, run } from "./build.mjs";

/** @typedef {import("@vibewars/ranking").RankedReceipt} RankedReceipt */
/** @typedef {{ kind: number, tags: string[][], content: string }} RelayEvent */

/** @param {Uint8Array} bytes */
const sha256 = (bytes) => new Uint8Array(createHash("sha256").update(bytes).digest());
const hex = (/** @type {Uint8Array} */ bytes) => Buffer.from(bytes).toString("hex");

/** Eight keys, each a real BIP-340 key; a receipt seats the first four unless told otherwise. */
const KEYS = Array.from({ length: 8 }, () => {
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
 * A 2v2 receipt of `keys` (the first four), team 0 winning, signed by every seat but `leavers`
 * and `unsigned`, and by `only` alone when given (a partial).
 * @param {{ matchId: string, leavers?: string[], only?: string, at?: number, keys?: typeof KEYS }} play
 * @returns {RankedReceipt}
 */
function receipt({ matchId, leavers = [], only, at = 0, keys = KEYS.slice(0, 4) }) {
  const seats = keys.map((key) => key.pubkey);
  const start = {
    matchId,
    buildHash: "build",
    mode: "team-arena",
    map: "isle",
    seed: 1,
    startedAt: DAY * 86_400 + 3_600 + at,
    teams: [seats.slice(0, 2), seats.slice(2)].map((team) =>
      team.map((pubkey) => ({
        pubkey,
        characterId: "starter",
        name: `N${pubkey.slice(0, 4)}`,
        claimedRating: 800,
        leaderboardAsOf: 0,
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
  const signers = keys.filter(
    (key) => !leavers.includes(key.pubkey) && (only === undefined || key.pubkey === only),
  );
  return {
    start,
    startSigs: Object.fromEntries(keys.map((key) => [key.pubkey, key.sign(startOf)])),
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
 * One run on `dir`, as of `asOfDay`, against relays that hold `held` (`undefined`: down).
 * @param {string} dir
 * @param {(RelayEvent[] | undefined)[]} held
 * @param {number} [asOfDay]
 */
async function runOn(dir, held, asOfDay = DAY) {
  /** @type {(number | undefined)[]} */
  const asked = [];
  const out = await run({
    dir,
    asOfDay,
    relays: RELAYS,
    fetch: (relay, since) => {
      asked.push(since);
      return Promise.resolve(held[RELAYS.indexOf(relay)]);
    },
  });
  return { ...out, asked };
}

/** @typedef {{ asOf: number, gated: boolean, count: number, entries: { pubkey: string, matches: number }[] }} Board */
/** @param {string} leaderboard */
const entriesOf = (leaderboard) => {
  /** @type {unknown} */
  const parsed = JSON.parse(leaderboard);
  return /** @type {Board} */ (parsed);
};

/** @param {{ shards: Record<string, string> }} out every archived line, shard by shard */
const linesOf = (out) => Object.values(out.shards).join("").split("\n").filter(Boolean);
/** @param {number} at unix seconds @returns {string} its shard's name */
const shardOf = (at) => `${new Date(at * 1000).toISOString().slice(0, 7)}.ndjson`;

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

  it("keeps each board under its asOf, and deletes those more than three hours older (#3575)", async () => {
    const dir = archiveDir();
    const boards = path.join(dir, "boards");
    const early = receipt({ matchId: "m1" });
    const late = receipt({ matchId: "m2", at: 3_600 });
    const first = await runOn(dir, [[event(early)], []]);
    const at = early.start.startedAt;
    expect(fs.readFileSync(path.join(boards, `${String(at)}.json`), "utf8")).toBe(
      first.leaderboard,
    );
    // Past boards a previous run left: one just inside the window, one just out.
    const kept = `${String(at + 3_600 - BOARD_KEPT_SECONDS)}.json`;
    const gone = `${String(at + 3_600 - BOARD_KEPT_SECONDS - 1)}.json`;
    fs.writeFileSync(path.join(boards, kept), "{}");
    fs.writeFileSync(path.join(boards, gone), "{}");
    const second = await runOn(dir, [[event(early), event(late)], []]);
    const newest = `${String(late.start.startedAt)}.json`;
    expect(fs.readdirSync(boards).sort()).toEqual([kept, `${String(at)}.json`, newest].sort());
    expect(fs.readFileSync(path.join(boards, newest), "utf8")).toBe(second.leaderboard);
    // The earlier board stays the bytes it was published as.
    expect(fs.readFileSync(path.join(boards, `${String(at)}.json`), "utf8")).toBe(
      first.leaderboard,
    );
    const third = await runOn(dir, [[event(early), event(late)], []]);
    expect(third.leaderboard).toBe(second.leaderboard);
    expect(fs.readdirSync(boards)).toHaveLength(3);
  });

  it("moves asOf past the previous board when a late receipt with an older startedAt changes it (#3575)", async () => {
    const dir = archiveDir();
    const older = receipt({ matchId: "m1" });
    const newer = receipt({ matchId: "m2", at: 300 });
    const first = await runOn(dir, [[event(newer)], []]);
    expect(entriesOf(first.leaderboard).asOf).toBe(newer.start.startedAt);
    const second = await runOn(dir, [[event(older), event(newer)], []]);
    expect(entriesOf(second.leaderboard).asOf).toBe(newer.start.startedAt + 1);
    const boards = path.join(dir, "boards");
    expect(
      fs.readFileSync(path.join(boards, `${String(newer.start.startedAt)}.json`), "utf8"),
    ).toBe(first.leaderboard);
    // Nothing new: the same asOf and the same bytes.
    const third = await runOn(dir, [[event(older), event(newer)], []]);
    expect(third.leaderboard).toBe(second.leaderboard);
  });

  it("fails, writing nothing, rather than rewrite a published board (#3575)", async () => {
    const dir = archiveDir();
    const early = receipt({ matchId: "m1" });
    const late = receipt({ matchId: "m2", at: 300 });
    const first = await runOn(dir, [[event(early)], []]);
    const planted = path.join(dir, "boards", `${String(late.start.startedAt)}.json`);
    fs.writeFileSync(planted, "{}");
    await expect(runOn(dir, [[event(early), event(late)], []])).rejects.toThrow(
      /published with other bytes/,
    );
    expect(fs.readFileSync(planted, "utf8")).toBe("{}");
    expect(fs.readFileSync(path.join(dir, "leaderboard.json"), "utf8")).toBe(first.leaderboard);
    const shard = path.join(dir, "receipts", shardOf(early.start.startedAt));
    expect(fs.readFileSync(shard, "utf8")).toBe(`${linesOf(first)[0] ?? ""}\n`);
  });

  it("merges partial copies of one result into one receipt", async () => {
    const dir = archiveDir();
    const [a, b, c, d] = KEYS.map((key) => key.pubkey);
    const partials = [a, b, c, d].map((only) => receipt({ matchId: "m1", only }));
    await runOn(dir, [partials.slice(0, 2).map((p) => event(p, "/r1/x")), undefined]);
    const merged = await runOn(dir, [undefined, partials.slice(2).map((p) => event(p, "/r1/y"))]);
    const { leaderboard } = merged;
    const lines = linesOf(merged);
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
    const shard = path.join(dir, "receipts", shardOf(future.start.startedAt));
    fs.writeFileSync(shard, `${JSON.stringify(future)}\n`);
    const second = await runOn(dir, [[], []]);
    expect(second.asked).toEqual(RELAYS.map(() => match.start.startedAt - 2 * 86_400));
    expect(entriesOf(second.leaderboard).asOf).toBe(match.start.startedAt);
  });

  it("takes in no receipt or partial that started before the as-of day's day before yesterday", async () => {
    const dir = archiveDir();
    const twoDaysBack = -2 * 86_400 - 3_600;
    const oldest = receipt({ matchId: "m1", at: twoDaysBack });
    const stale = receipt({ matchId: "m2", at: twoDaysBack - 1 });
    const stalePartial = receipt({
      matchId: "m3",
      at: twoDaysBack - 1,
      only: KEYS[0]?.pubkey ?? "",
    });
    const first = await runOn(dir, [[event(oldest), event(stale), event(stalePartial)], []]);
    expect(first.log).toMatch(/stale: 2\n/);
    expect(linesOf(first).map((line) => parseReceipt(line)?.start.matchId)).toEqual(["m1"]);

    // Archived, a receipt is not judged again a day later.
    const later = await runOn(dir, [[], []], DAY + 1);
    expect(linesOf(later)).toHaveLength(1);
  });

  it("keeps a shard per month, and rewrites only the month a late receipt lands in", async () => {
    const dir = archiveDir();
    const october = receipt({ matchId: "m1", at: -30 * 86_400 });
    const november = receipt({ matchId: "m2" });
    await runOn(dir, [[event(october)], []], DAY - 30);
    await runOn(dir, [[event(november)], []]);
    const shards = path.join(dir, "receipts");
    const names = [shardOf(october.start.startedAt), shardOf(november.start.startedAt)];
    expect(fs.readdirSync(shards).sort()).toEqual(names);
    const [octoberShard = "", novemberShard = ""] = names.map((name) => path.join(shards, name));
    const untouched = fs.statSync(novemberShard).mtimeMs;
    const before = fs.readFileSync(novemberShard);

    const late = receipt({ matchId: "m3", at: -30 * 86_400 + 60 });
    const out = await runOn(dir, [[event(late)], []], DAY - 29);
    expect(linesOf(out)).toHaveLength(3);
    expect(fs.readFileSync(octoberShard, "utf8").split("\n").filter(Boolean)).toHaveLength(2);
    expect(fs.readFileSync(novemberShard)).toEqual(before);
    expect(fs.statSync(novemberShard).mtimeMs).toBe(untouched);
  });

  it("fails, writing nothing, when a shard would outgrow what GitHub takes", async () => {
    const dir = archiveDir();
    const match = receipt({ matchId: "m1" });
    await expect(
      run({
        dir,
        asOfDay: DAY,
        relays: RELAYS,
        fetch: () => Promise.resolve([event(match)]),
        maxShardBytes: 100,
      }),
    ).rejects.toThrow(/over 100: GitHub refuses/);
    expect(fs.readdirSync(dir)).toEqual([]);
  });

  it("archives and rates a key in at most 50 receipts a UTC day, whatever order a run takes them in", async () => {
    const flood = Array.from({ length: 60 }, (_, i) =>
      receipt({ matchId: `f${String(i)}`, at: i }),
    );
    const others = KEYS.slice(4);
    // Seats two flooders at the cap and two keys under it: admitted.
    const mixed = receipt({
      matchId: "x",
      at: 200,
      keys: [...KEYS.slice(0, 2), ...others.slice(2)],
    });
    const honest = receipt({ matchId: "h", at: 300, keys: others });
    // A partial counts like any receipt: a flooder's is dropped, an honest one kept.
    const floodPartial = receipt({ matchId: "p", at: 400, only: KEYS[0]?.pubkey ?? "" });
    const partial = receipt({ matchId: "q", at: 500, keys: others, only: others[0]?.pubkey ?? "" });
    const all = [...flood, mixed, honest, floodPartial, partial].map((r) => event(r));

    const forward = await runOn(archiveDir(), [all, []]);
    const backward = await runOn(archiveDir(), [[...all].reverse(), []]);
    expect(backward.shards).toEqual(forward.shards);
    expect(backward.leaderboard).toBe(forward.leaderboard);

    const ids = linesOf(forward).map((line) => parseReceipt(line)?.start.matchId);
    expect(ids).toEqual([...flood.slice(0, 50).map((r) => r.start.matchId), "x", "h", "q"]);
    const matches = new Map(
      entriesOf(forward.leaderboard).entries.map((entry) => [entry.pubkey, entry.matches]),
    );
    expect(KEYS.map((key) => matches.get(key.pubkey))).toEqual([51, 51, 50, 50, 1, 1, 2, 2]);
    expect(forward.log).toContain("over-cap: 11\n");
    expect(forward.log).toContain(`  ${KEYS[0]?.pubkey ?? ""}: 11\n`);
    expect(forward.log).not.toContain(`  ${others[2]?.pubkey ?? ""}:`);
  });

  it("keeps all 50 of a key's receipts in a day, and the day before's", async () => {
    const day = Array.from({ length: 50 }, (_, i) => receipt({ matchId: `d${String(i)}`, at: i }));
    const before = receipt({ matchId: "b", at: -86_400 });
    const out = await runOn(archiveDir(), [[...day, before].map((r) => event(r)), []]);
    expect(linesOf(out)).toHaveLength(51);
    expect(out.log).toContain("over-cap: 0\n");
  });

  /**
   * 51 receipts backdated to `real`'s day, each between `loser` and three
   * sybils: the 51st finds every seat at the cap.
   * @param {(typeof KEYS)[number]} loser
   */
  const backdatedFlood = (loser) => {
    const sybils = [KEYS[4], KEYS[5], loser, KEYS[6]].filter((key) => key !== undefined);
    return Array.from({ length: 51 }, (_, i) =>
      receipt({ matchId: `s${String(i)}`, at: i, keys: sybils }),
    );
  };

  it("never evicts an archived loss for a backdated flood on its day (perf-sec-qa)", async () => {
    const dir = archiveDir();
    const loser = KEYS[2];
    if (loser === undefined) {
      throw new Error("four keys");
    }
    const real = receipt({ matchId: "real", at: 36_000 });
    await runOn(dir, [[event(real)], []]);
    const out = await runOn(dir, [backdatedFlood(loser).map((r) => event(r)), []]);
    const ids = linesOf(out).map((line) => parseReceipt(line)?.start.matchId);
    expect(ids).toContain("real");
    expect(ids).not.toContain("s50");
    expect(out.log).toContain("over-cap: 1\n");
  });

  it("admits a lost match whose loser flooded the same run, since its other seats are under the cap (lead-dev)", async () => {
    const loser = KEYS[2];
    if (loser === undefined) {
      throw new Error("four keys");
    }
    const real = receipt({ matchId: "real", at: 36_000 });
    const out = await runOn(archiveDir(), [
      [...backdatedFlood(loser), real].map((r) => event(r)),
      [],
    ]);
    const ids = linesOf(out).map((line) => parseReceipt(line)?.start.matchId);
    expect(ids).toContain("real");
    expect(ids).not.toContain("s50");
    const matches = new Map(
      entriesOf(out.leaderboard).entries.map((entry) => [entry.pubkey, entry.matches]),
    );
    expect(matches.get(KEYS[0]?.pubkey ?? "")).toBe(1);
    expect(matches.get(loser.pubkey)).toBe(51);
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

  /**
   * A previous board in a new archive: `keys` established, padded with
   * made-up established keys up to `established`, then `others` as given.
   * @param {{ keys?: (string | undefined)[], established?: number, others?: object[], gated?: boolean }} board
   */
  const boardDir = ({ keys = [], established = 0, others = [], gated = false }) => {
    const dir = archiveDir();
    const pad = Array.from({ length: Math.max(0, established - keys.length) }, (_, i) =>
      String(i).padStart(64, "f"),
    );
    const entries = [
      ...[...keys, ...pad].map((pubkey) => ({ pubkey, provisional: false, forked: false })),
      ...others,
    ];
    fs.writeFileSync(
      path.join(dir, "leaderboard.json"),
      `${JSON.stringify({ asOf: 1, gated, entries })}\n`,
    );
    return dir;
  };
  const [established, provisional, forked] = KEYS.map((key) => key.pubkey);
  const fresh = KEYS.slice(4);
  /** @param {string} matchId @param {(typeof KEYS)[number] | undefined} seat beside three fresh keys */
  const withFresh = (matchId, seat, at = 0) =>
    receipt({ matchId, at, keys: [seat, ...fresh.slice(1)].filter((key) => key !== undefined) });
  /** @param {{ leaderboard: string }} out */
  const gatedOf = (out) => entriesOf(out.leaderboard).gated;
  /** @param {{ shards: Record<string, string> }} out */
  const idsOf = (out) => linesOf(out).map((line) => parseReceipt(line)?.start.matchId);

  it("takes in, once 20 keys are established, only a receipt with an established seat (#3745)", async () => {
    const dir = boardDir({
      keys: [established],
      established: 20,
      others: [
        { pubkey: provisional, provisional: true, forked: false },
        { pubkey: forked, provisional: false, forked: true },
      ],
    });
    const out = await runOn(dir, [
      [
        event(receipt({ matchId: "fresh", keys: fresh })),
        event(withFresh("provisional", KEYS[1])),
        event(withFresh("forked", KEYS[2])),
        event(withFresh("established", KEYS[0])),
        event(receipt({ matchId: "partial", keys: fresh, only: fresh[0]?.pubkey ?? "" })),
      ],
      [],
    ]);
    expect(idsOf(out)).toEqual(["established"]);
    expect(out.log).toContain("  no-established-seat: 4\n");
    expect(gatedOf(out)).toBe(true);
  });

  it("is ungated below 20 established keys, and stays gated once it was (#3745)", async () => {
    const below = await runOn(boardDir({ keys: [established], established: 19 }), [
      [event(receipt({ matchId: "fresh", keys: fresh }))],
      [],
    ]);
    expect(idsOf(below)).toEqual(["fresh"]);
    expect(gatedOf(below)).toBe(false);

    const fell = await runOn(boardDir({ keys: [established], established: 19, gated: true }), [
      [event(receipt({ matchId: "fresh", keys: fresh })), event(withFresh("established", KEYS[0]))],
      [],
    ]);
    expect(idsOf(fell)).toEqual(["established"]);
    expect(gatedOf(fell)).toBe(true);
  });

  it("refuses as over-cap a receipt whose established seat is at the cap, the same in any order (#3745)", async () => {
    const flood = Array.from({ length: 51 }, (_, i) => withFresh(`e${String(i)}`, KEYS[0], i));
    const all = [...flood, receipt({ matchId: "fresh", keys: fresh })].map((r) => event(r));
    const board = { keys: [established], established: 20 };
    const forward = await runOn(boardDir(board), [all, []]);
    const backward = await runOn(boardDir(board), [[...all].reverse(), []]);
    expect(backward.shards).toEqual(forward.shards);
    expect(backward.leaderboard).toBe(forward.leaderboard);
    expect(idsOf(forward)).toEqual(flood.slice(0, 50).map((r) => r.start.matchId));
    expect(forward.log).toContain("over-cap: 1\n");
    expect(forward.log).toContain(`  ${established ?? ""}: 1\n`);
    expect(forward.log).not.toContain(`  ${fresh[1]?.pubkey ?? ""}:`);
    expect(forward.log).toContain("  no-established-seat: 1\n");
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
